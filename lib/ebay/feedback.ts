import { tradingCall } from './trading'

// GetFeedback — הפידבק שהמוכרת קיבלה מקונים. קריאה בלבד (ברשימת ה-allowlist ב-guard.ts).
// eBay מחזיר מהחדש לישן, עד 200 בדף. FeedbackSummary מגיע בכל דף.

type XmlNode = Record<string, unknown>

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v))
const int = (v: unknown): number | null => {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : null
}
/** ה-parser של trading.ts לא מגדיר את השדות האלה כמערך — אחד מגיע כאובייקט */
const list = (v: unknown): XmlNode[] => (v == null ? [] : Array.isArray(v) ? (v as XmlNode[]) : [v as XmlNode])

export type FeedbackType = 'Positive' | 'Neutral' | 'Negative'

export interface FeedbackEntry {
  feedbackId: string
  commentType: FeedbackType
  commentText: string
  commentTime: string
  /** שם הקונה מוסתר (d***k). eBay לפעמים מחזיר ערך דמה — גם הוא מוסתר */
  buyerMasked: string | null
  buyerScore: number | null
  itemId: string | null
  itemTitle: string | null
  itemPrice: string | null
  currency: string | null
  response: string | null
}

export interface FeedbackSummary {
  /** ציון הפידבק של המוכרת (FeedbackScore) */
  score: number | null
  /** 12 חודשים אחרונים — לפי הנוסחה של eBay: חיובי / (חיובי + שלילי) */
  positive12m: number | null
  neutral12m: number | null
  negative12m: number | null
  positivePct12m: number | null
  /** דירוגי מוכר מפורטים (1–5), למשל ItemAsDescribed → 4.9 */
  ratings: { key: string; rating: number; count: number | null }[]
}

export interface FeedbackPage {
  entries: FeedbackEntry[]
  totalPages: number
  totalEntries: number
  summary: FeedbackSummary
}

/** d***k — האות הראשונה והאחרונה בלבד. לא שומרים ולא מציגים את שם המשתמש המלא. */
export function maskUser(user: string | null): string | null {
  if (!user) return null
  const u = user.trim()
  if (u.length <= 2) return `${u[0] ?? ''}***`
  return `${u[0]}***${u[u.length - 1]}`
}

function period(arr: unknown, days: number): number | null {
  const p = list((arr as XmlNode | undefined)?.FeedbackPeriod).find((x) => int(x.PeriodInDays) === days)
  return p ? int(p.Count) : null
}

export function parseSummary(r: XmlNode): FeedbackSummary {
  const s = (r.FeedbackSummary ?? {}) as XmlNode
  const positive12m = period(s.PositiveFeedbackPeriodArray, 365)
  const neutral12m = period(s.NeutralFeedbackPeriodArray, 365)
  const negative12m = period(s.NegativeFeedbackPeriodArray, 365)
  const denom = (positive12m ?? 0) + (negative12m ?? 0)
  const summaries = list(((s.SellerRatingSummaryArray ?? {}) as XmlNode).AverageRatingSummary)
  // העדפה לתקופה הארוכה (FiftyTwoWeeks) אם יש כמה
  const pick = summaries.find((x) => str(x.FeedbackSummaryPeriod) === 'FiftyTwoWeeks') ?? summaries[0]
  const ratings = list(pick?.AverageRatingDetails)
    .map((d) => ({ key: String(d.RatingDetail ?? ''), rating: Number(d.Rating), count: int(d.RatingCount) }))
    .filter((d) => d.key && Number.isFinite(d.rating))
  return {
    score: int(r.FeedbackScore),
    positive12m,
    neutral12m,
    negative12m,
    positivePct12m: denom > 0 ? Math.round(((positive12m ?? 0) / denom) * 1000) / 10 : null,
    ratings,
  }
}

export function parseEntry(d: XmlNode): FeedbackEntry | null {
  const type = str(d.CommentType)
  const id = str(d.FeedbackID)
  const time = str(d.CommentTime)
  if (!id || !time || (type !== 'Positive' && type !== 'Neutral' && type !== 'Negative')) return null
  const price = d.ItemPrice
  const priceObj = price && typeof price === 'object' ? (price as XmlNode) : null
  return {
    feedbackId: id,
    commentType: type,
    commentText: str(d.CommentText) ?? '',
    commentTime: time,
    buyerMasked: maskUser(str(d.CommentingUser)),
    buyerScore: int(d.CommentingUserScore),
    itemId: str(d.ItemID),
    itemTitle: str(d.ItemTitle),
    itemPrice: priceObj ? str(priceObj['#text']) : str(price),
    currency: priceObj ? str(priceObj['@_currencyID']) : null,
    response: str(d.FeedbackResponse),
  }
}

export async function getFeedbackPage(page: number, perPage = 200): Promise<FeedbackPage> {
  const r = await tradingCall(
    'GetFeedback',
    `  <FeedbackType>FeedbackReceivedAsSeller</FeedbackType>
  <DetailLevel>ReturnAll</DetailLevel>
  <Pagination><EntriesPerPage>${perPage}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>`,
  )
  const pagination = (r.PaginationResult ?? {}) as XmlNode
  const details = list(((r.FeedbackDetailArray ?? {}) as XmlNode).FeedbackDetail)
  return {
    entries: details.map(parseEntry).filter((e): e is FeedbackEntry => !!e),
    totalPages: int(pagination.TotalNumberOfPages) ?? 1,
    totalEntries: int(pagination.TotalNumberOfEntries) ?? details.length,
    summary: parseSummary(r),
  }
}
