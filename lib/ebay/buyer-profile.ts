import { tradingCall } from './trading'

// פרופיל ציבורי של קונה ב-eBay: GetUser (ציון, אחוז חיובי, תאריך הרשמה) + GetFeedback עם UserID
// (BuyerRoleMetrics — כמה פידבק חיובי / ניטרלי / שלילי הקונה *נתן* למוכרים). שתיהן ב-allowlist של guard.ts.
// מוכר יכול לתת לקונה רק פידבק חיובי, לכן הפידבק שהקונה *קיבל* כמעט תמיד 100% — האות המעניין הוא מה שהוא נותן.
// שמות השדות לפי תיעוד eBay — לא נבדקו בחשבון. אם GetFeedback על משתמש אחר נדחה, נשמר רק מה שמ-GetUser.

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

export function parseBuyerMetrics(r: XmlNode): Pick<BuyerProfile, 'positiveLeft' | 'neutralLeft' | 'negativeLeft'> {
  const m = (((r.FeedbackSummary ?? {}) as XmlNode).BuyerRoleMetrics ?? {}) as XmlNode
  return { positiveLeft: int(m.PositiveFeedbackLeftCount), neutralLeft: int(m.NeutralFeedbackLeftCount), negativeLeft: int(m.NegativeFeedbackLeftCount) }
}

export async function getBuyerProfile(username: string): Promise<BuyerProfile & { calls: number }> {
  const id = xml(username.trim())
  const user = parseUser(await tradingCall('GetUser', `  <UserID>${id}</UserID>\n  <DetailLevel>ReturnAll</DetailLevel>`))
  let metrics: ReturnType<typeof parseBuyerMetrics> = { positiveLeft: null, neutralLeft: null, negativeLeft: null }
  let feedbackError: string | null = null
  try {
    metrics = parseBuyerMetrics(
      await tradingCall('GetFeedback', `  <UserID>${id}</UserID>\n  <DetailLevel>ReturnSummary</DetailLevel>\n  <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`),
    )
  } catch (err) {
    feedbackError = err instanceof Error ? err.message : String(err)
  }
  return { ...user, ...metrics, feedbackError, calls: 2 }
}
