import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { FeedbackSummary } from '@/lib/ebay/feedback'
import { FEEDBACK_SUMMARY_KEY } from './fetch'

const F = schema.ebayFeedback
const M = schema.channelMappings

export type ReviewFilter = 'shown' | 'suggested' | 'positive' | 'neutral' | 'negative' | 'all'
export const REVIEW_FILTERS: ReviewFilter[] = ['shown', 'suggested', 'positive', 'neutral', 'negative', 'all']

/** "מומלצת": חיובית, עם טקסט של ממש (לא "A+++"), ועוד לא הוחלט עליה */
const SUGGESTED_MIN_CHARS = 30
const suggested = sql`${F.commentType} = 'Positive' and length(${F.commentText}) >= ${SUGGESTED_MIN_CHARS} and ${F.decidedAt} is null`

function filterSql(f: ReviewFilter): SQL | undefined {
  switch (f) {
    case 'shown':
      return eq(F.showOnSite, true)
    case 'suggested':
      return suggested
    case 'positive':
      return eq(F.commentType, 'Positive')
    case 'neutral':
      return eq(F.commentType, 'Neutral')
    case 'negative':
      return eq(F.commentType, 'Negative')
    default:
      return undefined
  }
}

export interface StoredSummary extends FeedbackSummary {
  fetchedAt: string
  totalOnEbay: number
}

export async function getSummary(): Promise<StoredSummary | null> {
  const [row] = await db.select().from(schema.syncCursors).where(eq(schema.syncCursors.key, FEEDBACK_SUMMARY_KEY))
  if (!row) return null
  try {
    return JSON.parse(row.value) as StoredSummary
  } catch {
    return null
  }
}

/** שם המשתמש של המוכרת (מהחיבור ל-eBay) — לקישור לעמוד הפידבק ב-eBay */
export async function getSellerUserId(): Promise<string | null> {
  const [row] = await db.select({ u: schema.ebayTokens.ebayUserId }).from(schema.ebayTokens).where(eq(schema.ebayTokens.environment, 'production'))
  return row?.u ?? null
}

export const feedbackProfileUrl = (user: string | null) => (user ? `https://www.ebay.com/fdbk/feedback_profile/${encodeURIComponent(user)}` : null)

export async function listReviews(opts: { filter: ReviewFilter; offset?: number; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)
  const rows = await db
    .select({
      id: F.id,
      commentType: F.commentType,
      commentText: F.commentText,
      commentTime: F.commentTime,
      buyerMasked: F.buyerMasked,
      buyerScore: F.buyerScore,
      itemId: F.itemId,
      itemTitle: F.itemTitle,
      itemPrice: F.itemPrice,
      currency: F.currency,
      response: F.response,
      showOnSite: F.showOnSite,
      productId: M.productId,
      sku: M.sku,
      wooProductId: M.wooProductId,
    })
    .from(F)
    .leftJoin(M, eq(M.ebayItemId, F.itemId))
    .where(filterSql(opts.filter))
    .orderBy(desc(F.commentTime), desc(F.id))
    .limit(limit + 1)
    .offset(offset)

  const [counts] = await db
    .select({
      all: sql<number>`count(*)`.mapWith(Number),
      shown: sql<number>`count(*) filter (where ${F.showOnSite})`.mapWith(Number),
      suggested: sql<number>`count(*) filter (where ${suggested})`.mapWith(Number),
      positive: sql<number>`count(*) filter (where ${F.commentType} = 'Positive')`.mapWith(Number),
      neutral: sql<number>`count(*) filter (where ${F.commentType} = 'Neutral')`.mapWith(Number),
      negative: sql<number>`count(*) filter (where ${F.commentType} = 'Negative')`.mapWith(Number),
      linked: sql<number>`count(*) filter (where exists (select 1 from ${M} where ${M.ebayItemId} = ${F.itemId}))`.mapWith(Number),
    })
    .from(F)

  const seller = await getSellerUserId()
  return {
    rows: rows.slice(0, limit).map((r) => ({ ...r, commentTime: r.commentTime.toISOString() })),
    nextOffset: rows.length > limit ? offset + limit : null,
    counts,
    summary: await getSummary(),
    seller,
    profileUrl: feedbackProfileUrl(seller),
  }
}

export class ReviewNotAllowedError extends Error {}

/** בחירה ידנית: להציג באתר או לא. רק פידבק חיובי יכול להיות מוצג (גם אילוץ ב-DB). */
export async function setShowOnSite(id: string, show: boolean) {
  const [row] = await db.select({ type: F.commentType, text: F.commentText }).from(F).where(eq(F.id, id))
  if (!row) return null
  if (show && row.type !== 'Positive') throw new ReviewNotAllowedError('רק ביקורת חיובית יכולה להופיע באתר')
  if (show && !row.text.trim()) throw new ReviewNotAllowedError('אין טקסט בביקורת הזו')
  const [updated] = await db.update(F).set({ showOnSite: show, decidedAt: new Date() }).where(and(eq(F.id, id))).returning({ id: F.id, showOnSite: F.showOnSite })
  return updated
}

/** מה שהאתר מקבל: רק ביקורות שנבחרו, שם קונה מוסתר, בלי מחיר ובלי מזהים פנימיים */
export async function publicReviews(limit = 30) {
  const rows = await db
    .select({ text: F.commentText, date: F.commentTime, buyer: F.buyerMasked, buyerScore: F.buyerScore, item: F.itemTitle, response: F.response })
    .from(F)
    .where(eq(F.showOnSite, true))
    .orderBy(desc(F.commentTime))
    .limit(Math.min(Math.max(limit, 1), 50))
  const summary = await getSummary()
  const seller = await getSellerUserId()
  return {
    source: 'eBay',
    profileUrl: feedbackProfileUrl(seller),
    score: summary?.score ?? null,
    positivePct12m: summary?.positivePct12m ?? null,
    ratings12m: summary ? (summary.positive12m ?? 0) + (summary.neutral12m ?? 0) + (summary.negative12m ?? 0) : null,
    detailedRatings: summary?.ratings ?? [],
    updatedAt: summary?.fetchedAt ?? null,
    reviews: rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) })),
  }
}
