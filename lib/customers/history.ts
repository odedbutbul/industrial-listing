import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNotNull, isNull, lt, not, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getBuyerProfile } from '@/lib/ebay/buyer-profile'
import { searchPostOrder } from '@/lib/ebay/post-order'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { linkCases, upsertCase } from './cases'

// היסטוריית התנהלות של לקוחות מ-eBay (קריאה בלבד):
// 1. Post-Order: החזרות, פניות, קייסים וביטולים שנפתחו בטווח → customer_cases
// 2. קישור אירועים ללקוחות (הזמנה → לקוח, שם משתמש → לקוח)
// 3. פרופיל קונה (GetUser + GetFeedback) ללקוחות שאין להם, או שהפרופיל ישן מ-30 יום
// ביטולים והחזרים כספיים נקלטים גם בכל ריצה של poll-ebay-orders (מ-getOrders).
// ב-sync_log נכתבות רק ספירות — בלי שמות משתמש ובלי פרטים אישיים.

export const CUSTOMER_HISTORY_JOB = 'customer-history'
const PROFILE_MAX_AGE_DAYS = 30

export interface HistoryResult {
  runId: string
  from: string
  to: string
  ebayCalls: number
  found: number
  created: number
  updated: number
  linked: number
  profiles: number
  profileErrors: number
  errors: { step: string; error: string }[]
  durationMs: number
}

export async function fetchCustomerHistory(opts: { days?: number; profiles?: number; skipCases?: boolean } = {}): Promise<HistoryResult> {
  return withJobLock(CUSTOMER_HISTORY_JOB, () => run(opts))
}

async function run(opts: { days?: number; profiles?: number; skipCases?: boolean }): Promise<HistoryResult> {
  const started = Date.now()
  const to = new Date()
  const from = new Date(to.getTime() - (opts.days ?? 90) * 86400_000)
  const r: HistoryResult = { runId: randomUUID(), from: from.toISOString(), to: to.toISOString(), ebayCalls: 0, found: 0, created: 0, updated: 0, linked: 0, profiles: 0, profileErrors: 0, errors: [], durationMs: 0 }

  if (!opts.skipCases) {
    const po = await searchPostOrder(from, to)
    r.ebayCalls += po.calls
    r.found = po.cases.length
    for (const e of po.errors) r.errors.push({ step: `post-order:${e.kind}`, error: e.error })
    for (const c of po.cases) {
      const res = await upsertCase(db, {
        channel: 'ebay',
        kind: c.kind,
        externalId: c.externalId,
        externalOrderId: c.orderId,
        buyerUsername: c.buyerUsername,
        initiator: c.initiator,
        status: c.status,
        isOpen: c.isOpen,
        reason: c.reason,
        comment: c.comment,
        amount: c.amount,
        currency: c.currency,
        itemId: c.itemId,
        openedAt: c.openedAt,
        closedAt: c.closedAt,
        source: 'post_order',
      })
      r[res]++
    }
  }
  r.linked = await linkCases(db)

  // פרופילים: לקוחות eBay עם שם משתמש אמיתי (לא אחרי מחיקה), הישנים / החסרים קודם
  const limit = opts.profiles ?? 100
  if (limit > 0) {
    const c = schema.customers
    const stale = new Date(Date.now() - PROFILE_MAX_AGE_DAYS * 86400_000)
    const due = await db
      .select({ id: c.id, username: c.ebayUsername })
      .from(c)
      .where(and(isNotNull(c.ebayUsername), not(sql`${c.ebayUsername} like 'anon:%'`), isNull(c.anonymizedAt), or(isNull(c.ebayProfileFetchedAt), lt(c.ebayProfileFetchedAt, stale))))
      .orderBy(sql`${c.ebayProfileFetchedAt} asc nulls first`, asc(c.createdAt))
      .limit(limit)
    for (const row of due) {
      try {
        const p = await getBuyerProfile(row.username!)
        r.ebayCalls += p.calls
        await db
          .update(c)
          .set({
            ebayFeedbackScore: p.feedbackScore,
            ebayPositivePct: p.positivePct === null ? null : String(p.positivePct),
            ebayRegisteredAt: p.registeredAt,
            ebayFeedbackPrivate: p.feedbackPrivate,
            // GetFeedback נכשל — לא מוחקים ספירות שכבר נשמרו
            ...(p.feedbackError ? {} : { ebayPositiveLeft: p.positiveLeft, ebayNeutralLeft: p.neutralLeft, ebayNegativeLeft: p.negativeLeft }),
            ebayProfileFetchedAt: new Date(),
            ebayProfileError: p.feedbackError ? `פידבק שהקונה נתן: ${p.feedbackError}`.slice(0, 300) : null,
            updatedAt: sql`now()`,
          })
          .where(eq(c.id, row.id))
        r.profiles++
        if (p.feedbackError) r.profileErrors++
      } catch (err) {
        r.ebayCalls++
        r.profileErrors++
        const error = err instanceof Error ? err.message : String(err)
        // מסמנים שנוסה — לא ננסה שוב כל ריצה על משתמש שנסגר / לא קיים
        await db.update(c).set({ ebayProfileFetchedAt: new Date(), ebayProfileError: error.slice(0, 300), updatedAt: sql`now()` }).where(eq(c.id, row.id))
      }
    }
  }

  r.durationMs = Date.now() - started
  await writeSyncLog({
    job: CUSTOMER_HISTORY_JOB,
    runId: r.runId,
    channel: 'ebay',
    action: 'run',
    success: r.errors.length === 0,
    error: r.errors.length ? r.errors.map((e) => `${e.step}: ${e.error}`).join(' · ').slice(0, 500) : undefined,
    durationMs: r.durationMs,
    details: { from: r.from, to: r.to, ebayCalls: r.ebayCalls, found: r.found, created: r.created, updated: r.updated, linked: r.linked, profiles: r.profiles, profileErrors: r.profileErrors },
  })
  return r
}
