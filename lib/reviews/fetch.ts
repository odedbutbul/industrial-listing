import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getFeedbackPage, type FeedbackSummary } from '@/lib/ebay/feedback'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'

// משיכת הפידבק מ-eBay ל-ebay_feedback. קריאה בלבד ב-eBay (GetFeedback).
// eBay מחזיר מהחדש לישן: במשיכה רגילה עוצרים בדף הראשון שאין בו אף פידבק חדש.
// הטקסט ושם הקונה לא נכתבים ל-sync_log.

export const FEEDBACK_SUMMARY_KEY = 'ebay_feedback_summary'
const PER_PAGE = 200

export interface FetchFeedbackResult {
  pages: number
  calls: number
  fetched: number
  created: number
  /** פידבק שהשתנה (למשל קונה ששינה לחיובי) */
  updated: number
  totalOnEbay: number
  summary: FeedbackSummary
}

/** maxPages: תקרה לריצה אחת (מכסת Trading API). full: לא לעצור בדף בלי חדשים. */
export async function fetchEbayFeedback(opts: { maxPages?: number; full?: boolean } = {}): Promise<FetchFeedbackResult> {
  const maxPages = Math.min(Math.max(opts.maxPages ?? 5, 1), 50)
  return withJobLock('ebay-feedback', async () => {
    const started = Date.now()
    const r: Omit<FetchFeedbackResult, 'summary'> = { pages: 0, calls: 0, fetched: 0, created: 0, updated: 0, totalOnEbay: 0 }
    let summary: FeedbackSummary | null = null
    try {
      for (let page = 1; page <= maxPages; page++) {
        r.calls++
        const p = await getFeedbackPage(page, PER_PAGE)
        r.pages = page
        r.totalOnEbay = p.totalEntries
        if (page === 1) summary = p.summary
        let createdHere = 0
        for (const e of p.entries) {
          r.fetched++
          const values = {
            feedbackId: e.feedbackId,
            commentType: e.commentType,
            commentText: e.commentText,
            commentTime: new Date(e.commentTime),
            buyerMasked: e.buyerMasked,
            buyerScore: e.buyerScore,
            itemId: e.itemId,
            itemTitle: e.itemTitle,
            itemPrice: e.itemPrice,
            currency: e.currency,
            response: e.response,
          }
          const F = schema.ebayFeedback
          // xmax = 0 → שורה חדשה. עדכון רק כשמשהו השתנה. show_on_site נשאר כפי שנבחר,
          // אלא אם הפידבק כבר לא חיובי — אז הוא יורד מהאתר.
          const [row] = await db
            .insert(F)
            .values(values)
            .onConflictDoUpdate({
              target: F.feedbackId,
              set: {
                commentType: values.commentType,
                commentText: values.commentText,
                commentTime: values.commentTime,
                response: values.response,
                fetchedAt: new Date(),
                showOnSite: sql`case when excluded.comment_type = 'Positive' then ${F.showOnSite} else false end`,
              },
              setWhere: sql`${F.commentType} is distinct from excluded.comment_type or ${F.commentText} is distinct from excluded.comment_text or ${F.response} is distinct from excluded.response`,
            })
            .returning({ inserted: sql<boolean>`xmax = 0` })
          if (!row) continue // לא השתנה
          if (row.inserted) {
            r.created++
            createdHere++
          } else {
            r.updated++
          }
        }
        if (page >= p.totalPages) break
        if (!opts.full && createdHere === 0) break
      }
      if (summary) {
        const value = JSON.stringify({ ...summary, fetchedAt: new Date().toISOString(), totalOnEbay: r.totalOnEbay })
        await db
          .insert(schema.syncCursors)
          .values({ key: FEEDBACK_SUMMARY_KEY, value })
          .onConflictDoUpdate({ target: schema.syncCursors.key, set: { value } })
      }
      await writeSyncLog({ job: 'ebay-feedback', channel: 'ebay', action: 'fetch_feedback', success: true, details: { ...r }, durationMs: Date.now() - started })
      return { ...r, summary: summary ?? { score: null, positive12m: null, neutral12m: null, negative12m: null, positivePct12m: null, ratings: [] } }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await writeSyncLog({ job: 'ebay-feedback', channel: 'ebay', action: 'fetch_feedback', success: false, error: msg.slice(0, 500), details: { ...r }, durationMs: Date.now() - started })
      throw e
    }
  })
}
