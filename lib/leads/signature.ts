import { createHmac, timingSafeEqual } from 'node:crypto'

// חתימה משותפת בין האתר (theme: inc/lead-push.php) למערכת. סוד אחד בשני הצדדים:
// כאן LEADS_SHARED_SECRET, באתר הקבוע VZ_LEADS_SECRET ב-wp-config.php. הערך לא נכנס לריפו.
//
//   X-VZ-Timestamp: שניות יוניקס
//   X-VZ-Signature: sha256=<hex של HMAC-SHA256(secret, "<timestamp>.<message>")>
//
// message = גוף הבקשה (POST מהאתר) או "GET <route>" (בקשה של המערכת לאתר).
// חתימה ישנה מ-5 דקות נדחית — הקלטה של בקשה לא ניתנת לשידור חוזר מאוחר.

export const MAX_SKEW_SECONDS = 300

export class LeadsConfigError extends Error {}

export function leadsSecret(): string {
  const s = process.env.LEADS_SHARED_SECRET?.trim()
  if (!s) throw new LeadsConfigError('חסר משתנה סביבה: LEADS_SHARED_SECRET')
  if (s.length < 32) throw new LeadsConfigError('LEADS_SHARED_SECRET קצר מדי (לפחות 32 תווים)')
  return s
}

export const leadsConfigured = () => (process.env.LEADS_SHARED_SECRET?.trim().length ?? 0) >= 32

export function sign(secret: string, timestamp: string, message: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${message}`).digest('hex')
}

export function signedHeaders(message: string, secret = leadsSecret(), now = Date.now()): Record<string, string> {
  const ts = String(Math.floor(now / 1000))
  return { 'X-VZ-Timestamp': ts, 'X-VZ-Signature': sign(secret, ts, message) }
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'bad_signature' }

export function verify(secret: string, timestamp: string | null, signature: string | null, message: string, now = Date.now()): VerifyResult {
  if (!timestamp || !signature || !/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: 'missing' }
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: 'stale' }
  const expected = Buffer.from(sign(secret, timestamp, message))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' }
  return { ok: true }
}
