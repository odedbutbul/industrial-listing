import { getEbayConfig } from './config'
import { EbayAuthError } from './auth'

// טוקן אפליקציה (client credentials) ל-Buy APIs — Browse API.
// לא קשור לחשבון vizvik16: הטוקן מזהה את האפליקציה בלבד ולא נותן גישה לשום פעולה בחשבון.
// לא נשמר ב-DB — מוחזק בזיכרון התהליך עד שפג.

const APP_SCOPE = 'https://api.ebay.com/oauth/api_scope'
const REFRESH_BUFFER_MS = 5 * 60 * 1000

let cached: { token: string; expiresAt: number; env: string } | null = null
let inflight: Promise<string> | null = null

export async function getAppAccessToken(): Promise<string> {
  const config = getEbayConfig()
  if (cached && cached.env === config.environment && cached.expiresAt - REFRESH_BUFFER_MS > Date.now()) return cached.token
  if (inflight) return inflight

  inflight = (async () => {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${config.appId}:${config.certId}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: APP_SCOPE }).toString(),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      throw new EbayAuthError(`eBay app token: ${data.error_description || data.error || `HTTP ${res.status}`}`)
    }
    cached = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 7200) * 1000, env: config.environment }
    return cached.token
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}
