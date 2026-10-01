import { getWooConfig } from './config'

// ספריית המדיה של WordPress (wp/v2/media) — תמונות של מוצרים ידניים עולות ישר לחנות ולא נשמרות בשרת המערכת
// (החלטת עודד 01/10/2026). מפתחות WooCommerce לא עובדים על wp/v2, לכן סיסמת אפליקציה של WordPress:
// WP_APP_USER + WP_APP_PASSWORD (Users → Profile → Application Passwords, משתמש Shop Manager).

const REQUIRED = ['WP_APP_USER', 'WP_APP_PASSWORD'] as const
const TIMEOUT_MS = 60_000

export class WpMediaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export const missingWpMediaEnv = () => REQUIRED.filter((k) => !process.env[k])

function auth(): { base: string; header: string } {
  const missing = missingWpMediaEnv()
  if (missing.length) throw new WpMediaError(`העלאת תמונות לחנות לא מוגדרת — חסרים בשרת: ${missing.join(', ')}`, 503)
  const { baseUrl } = getWooConfig()
  // סיסמת אפליקציה מוצגת ב-WordPress עם רווחים; WordPress מקבל אותה גם בלעדיהם
  const pass = process.env.WP_APP_PASSWORD!.replace(/\s+/g, '')
  return { base: `${baseUrl}/wp-json/wp/v2/media`, header: 'Basic ' + Buffer.from(`${process.env.WP_APP_USER}:${pass}`).toString('base64') }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new WpMediaError(timeout ? 'החנות לא ענתה בזמן' : 'אין חיבור לחנות', 0)
  }
  const text = await res.text()
  let json: { code?: string; message?: string } | null = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new WpMediaError(`החנות החזירה תשובה שאינה JSON (${res.status}) — ייתכן שהאתר חסום או מוגן`, res.status)
  }
  if (!res.ok) {
    const orig = json?.message ? ` (${json.message})` : ''
    if (res.status === 401) throw new WpMediaError(`סיסמת האפליקציה לא התקבלה — בדוק את WP_APP_USER ו-WP_APP_PASSWORD${orig}`, 401)
    if (res.status === 403) throw new WpMediaError(`למשתמש אין הרשאה להעלות קבצים${orig}`, 403)
    throw new WpMediaError(`שגיאה ${res.status} מספריית המדיה${orig}`, res.status)
  }
  return json as T
}

export interface WpMedia {
  id: number
  source_url: string
}

/** העלאת קובץ לספריית המדיה. הקובץ עובר בזיכרון בלבד. */
export async function uploadWpMedia(data: Buffer, fileName: string, mime: string, alt: string): Promise<WpMedia> {
  const { base, header } = auth()
  const media = await call<WpMedia>(base, {
    method: 'POST',
    headers: { Authorization: header, 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${fileName}"` },
    body: new Uint8Array(data),
  })
  if (alt) await updateWpMediaAlt(media.id, alt).catch(() => {})
  return { id: media.id, source_url: media.source_url }
}

export async function updateWpMediaAlt(id: number, alt: string): Promise<void> {
  const { base, header } = auth()
  await call(`${base}/${id}`, { method: 'POST', headers: { Authorization: header, 'Content-Type': 'application/json' }, body: JSON.stringify({ alt_text: alt }) })
}

/** מחיקה סופית מהספרייה (force — בלי סל מחזור). 404 = כבר לא קיים, נחשב הצלחה. */
export async function deleteWpMedia(id: number): Promise<void> {
  const { base, header } = auth()
  try {
    await call(`${base}/${id}?force=true`, { method: 'DELETE', headers: { Authorization: header } })
  } catch (e) {
    if (e instanceof WpMediaError && e.status === 404) return
    throw e
  }
}
