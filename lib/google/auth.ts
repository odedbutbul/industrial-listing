import { createSign } from 'node:crypto'
import { readServiceAccount } from './config'

// טוקן גישה לגוגל מ-service account (JWT bearer, RFC 7523) — בלי תלות חיצונית.
// הרשאות קריאה בלבד: Search Console + Analytics.

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly']
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

let cached: { token: string; expiresAt: number; email: string } | null = null

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url')

export async function googleAccessToken(): Promise<string> {
  const sa = readServiceAccount()
  if (cached && cached.email === sa.clientEmail && cached.expiresAt > Date.now() + 60_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.clientEmail, scope: GOOGLE_SCOPES.join(' '), aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  let signature: string
  try {
    signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.privateKey, 'base64url')
  } catch {
    throw new GoogleApiError('המפתח הפרטי ב-GOOGLE_SERVICE_ACCOUNT_JSON לא תקין', 0)
  }

  const res = await googleFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  })
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null
  if (!res.ok || !json?.access_token) throw new GoogleApiError(`גוגל דחה את ה-service account${json?.error_description || json?.error ? ` (${json.error_description ?? json.error})` : ''}`, res.status)
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000, email: sa.clientEmail }
  return cached.token
}

const TIMEOUT_MS = 60_000

async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new GoogleApiError(timeout ? `גוגל לא ענה תוך ${TIMEOUT_MS / 1000} שניות` : 'אין חיבור לגוגל (DNS / רשת)', 0)
  }
}

/**
 * קריאת POST ל-API של גוגל. שתי הקריאות שבהן משתמשים (searchAnalytics.query, runReport) הן שאילתות קריאה
 * שגוגל מגדיר כ-POST — לא משנות כלום בחשבון.
 */
export async function googlePost<T>(url: string, body: unknown): Promise<T> {
  const token = await googleAccessToken()
  const res = await googleFetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null
  if (!res.ok) throw new GoogleApiError(explain(res.status, json?.error?.message ?? null), res.status)
  return json as T
}

function explain(status: number, message: string | null): string {
  const orig = message ? ` (${message})` : ''
  if (status === 403) return `ל-service account אין גישה — צריך להוסיף את המייל שלו כמשתמש בנכס${orig}`
  if (status === 404) return `הנכס לא נמצא — בדוק את GSC_SITE_URL / GA4_PROPERTY_ID${orig}`
  if (status === 401) return `האימות מול גוגל נכשל${orig}`
  if (status === 429) return `חרגנו ממכסת הקריאות של גוגל — ננסה בריצה הבאה${orig}`
  return `שגיאה ${status} מגוגל${orig}`
}

/** לבדיקות בלבד */
export function _resetGoogleTokenCache() {
  cached = null
}
