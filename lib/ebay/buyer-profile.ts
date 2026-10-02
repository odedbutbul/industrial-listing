import { FEEDBACK_READ_SCOPE, getAppAccessToken } from './app-token'
import { getEbayConfig } from './config'
import { assertEbayRestAllowed } from './guard'
import { tradingCall } from './trading'

// פרופיל ציבורי של קונה ב-eBay:
// - GetUser (Trading, בלי DetailLevel): ציון, אחוז חיובי, תאריך הרשמה.
// - Feedback API (REST, טוקן אפליקציה, feedback_type=FEEDBACK_SENT): כמה פידבק הקונה *נתן* למוכרים, וכמה מזה שלילי / ניטרלי.
//   pagination.total לכל סינון — 3 קריאות GET. נבדק בחשבון 02/10/2026: עובד עם טוקן אפליקציה; עם טוקן החשבון — 403.
//   (Trading GetFeedback על קונה נכשל — "System error" עם ReturnSummary, ולא מחזיר BuyerRoleMetrics בשום צורה.)
// מוכר יכול לתת לקונה רק פידבק חיובי, לכן הפידבק שהקונה *קיבל* כמעט תמיד 100% — האות המעניין הוא מה שהוא נותן.

type XmlNode = Record<string, unknown>

const int = (v: unknown): number | null => {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : null
}
const dec = (v: unknown): number | null => {
  const n = Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface BuyerProfile {
  feedbackScore: number | null
  positivePct: number | null
  registeredAt: Date | null
  feedbackPrivate: boolean | null
  positiveLeft: number | null
  neutralLeft: number | null
  negativeLeft: number | null
  /** GetFeedback נכשל — יש רק נתוני GetUser */
  feedbackError: string | null
}

export function parseUser(r: XmlNode): Pick<BuyerProfile, 'feedbackScore' | 'positivePct' | 'registeredAt' | 'feedbackPrivate'> {
  const u = (r.User ?? {}) as XmlNode
  const reg = u.RegistrationDate ? new Date(String(u.RegistrationDate)) : null
  const priv = u.FeedbackPrivate
  return {
    feedbackScore: int(u.FeedbackScore),
    positivePct: dec(u.PositiveFeedbackPercent),
    registeredAt: reg && !Number.isNaN(reg.getTime()) ? reg : null,
    feedbackPrivate: priv === undefined ? null : String(priv) === 'true',
  }
}

/** כמה פידבק המשתמש נתן (FEEDBACK_SENT), לפי סוג. מחזיר את pagination.total */
async function sentCount(user: string, commentType?: 'NEGATIVE' | 'NEUTRAL'): Promise<number> {
  const path = '/commerce/feedback/v1/feedback'
  assertEbayRestAllowed('GET', path)
  const config = getEbayConfig()
  const token = await getAppAccessToken(FEEDBACK_READ_SCOPE)
  const url = new URL(path, config.apiBase)
  url.searchParams.set('user_id', user)
  url.searchParams.set('feedback_type', 'FEEDBACK_SENT')
  url.searchParams.set('limit', '25')
  if (commentType) url.searchParams.set('filter', `commentType:${commentType}`)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }, signal: AbortSignal.timeout(30000) })
  const d = (await res.json().catch(() => null)) as { pagination?: { total?: number }; errors?: { message?: string; longMessage?: string }[] } | null
  if (!res.ok) throw new Error(d?.errors?.[0]?.longMessage ?? d?.errors?.[0]?.message ?? `HTTP ${res.status}`)
  const total = Number(d?.pagination?.total)
  if (!Number.isFinite(total)) throw new Error('תשובה בלי pagination.total')
  return total
}

export async function getSentFeedback(user: string): Promise<Pick<BuyerProfile, 'positiveLeft' | 'neutralLeft' | 'negativeLeft'>> {
  const [all, neg, neu] = await Promise.all([sentCount(user), sentCount(user, 'NEGATIVE'), sentCount(user, 'NEUTRAL')])
  return { positiveLeft: Math.max(0, all - neg - neu), neutralLeft: neu, negativeLeft: neg }
}

export async function getBuyerProfile(username: string): Promise<BuyerProfile & { calls: number }> {
  const id = xml(username.trim())
  // בלי DetailLevel: ReturnAll על משתמש אחר נדחה ("ItemId required for this Detail Level", נבדק 02/10/2026)
  const user = parseUser(await tradingCall('GetUser', `  <UserID>${id}</UserID>`))
  let metrics: Pick<BuyerProfile, 'positiveLeft' | 'neutralLeft' | 'negativeLeft'> = { positiveLeft: null, neutralLeft: null, negativeLeft: null }
  let feedbackError: string | null = null
  try {
    metrics = await getSentFeedback(username.trim())
  } catch (err) {
    feedbackError = err instanceof Error ? err.message : String(err)
  }
  return { ...user, ...metrics, feedbackError, calls: 4 }
}
