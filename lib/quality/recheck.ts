import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getItem } from '@/lib/ebay/trading'
import { productDetailsUpdate } from '@/lib/sync/import-ebay'
import { JobLockedError, withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { scanListingQuality, type QualityScanResult } from './scan'

// בדיקה חוזרת של ממצאים מול eBay: GetItem (קריאה בלבד) למוצרים שיש להם ממצא פתוח → עדכון הפרטים במערכת → סריקה.
// הסריקה עצמה קובעת: ממצא שלא נמצא עוד עובר ל"תוקנו", ממצא שעדיין קיים נשאר פתוח.
//  - markIssueFixed: כפתור "תיקנתי" על ממצא אחד (המוצר + המוצרים הקשורים אליו)
//  - recheckOpenIssues: הריצה היומית (jobs/recheck-quality.ts) על כל הממצאים הפתוחים

export const RECHECK_JOB = 'quality-recheck'

const I = schema.listingIssues
const M = schema.channelMappings

interface RefreshResult {
  refreshed: number
  errors: { productId: string; itemId: string; error: string }[]
}

async function refreshFromEbay(productIds: string[], runId: string, concurrency = 3): Promise<RefreshResult> {
  const out: RefreshResult = { refreshed: 0, errors: [] }
  if (!productIds.length) return out
  const rows = await db
    .select({ productId: M.productId, itemId: M.ebayItemId })
    .from(M)
    .where(and(inArray(M.productId, productIds), isNotNull(M.ebayItemId)))
  let next = 0
  const worker = async () => {
    while (next < rows.length) {
      const r = rows[next++]
      try {
        const d = await getItem(r.itemId!)
        await db.update(schema.products).set(productDetailsUpdate(d)).where(eq(schema.products.id, r.productId))
        out.refreshed++
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        out.errors.push({ productId: r.productId, itemId: r.itemId!, error })
        await writeSyncLog({ job: RECHECK_JOB, runId, channel: 'ebay', action: 'get_item', success: false, error, productId: r.productId, details: { itemId: r.itemId } })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker))
  return out
}

/** סריקה, ואם סריקה אחרת רצה עכשיו — מחכה לה (סריקה לוקחת ~2 שניות) */
async function scanWhenFree(): Promise<QualityScanResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await scanListingQuality()
    } catch (e) {
      if (!(e instanceof JobLockedError) || attempt >= 8) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

export type MarkFixedResult =
  | { status: 'resolved' }
  | { status: 'still_open'; message: string }
  | { status: 'ebay_error'; error: string }

/**
 * "תיקנתי ב-eBay": קורא מחדש מ-eBay את המוצר (ואת המוצרים הקשורים לממצא — למשל מי שחולק איתו תמונות),
 * מריץ סריקה ומחזיר אם הממצא באמת ירד. לא מסמן "תוקן" בלי שהסריקה אישרה.
 */
export async function markIssueFixed(issueId: string): Promise<MarkFixedResult | null> {
  const [issue] = await db.select({ id: I.id, productId: I.productId, check: I.check, status: I.status, details: I.details }).from(I).where(eq(I.id, issueId))
  if (!issue || issue.status !== 'open') return null
  const related = ((issue.details as { related?: { id: string }[] }).related ?? []).map((r) => r.id)
  const ids = Array.from(new Set([issue.productId, ...related])).slice(0, 10)

  const runId = randomUUID()
  const started = Date.now()
  const refresh = await refreshFromEbay(ids, runId)
  if (refresh.errors.some((e) => e.productId === issue.productId)) {
    const error = refresh.errors.find((e) => e.productId === issue.productId)!.error
    return { status: 'ebay_error', error }
  }
  await scanWhenFree()
  // אותה בדיקה על אותו מוצר עדיין פתוחה (גם אם בנוסח אחר — למשל מספר אחר על התווית) = לא תוקן
  const [still] = await db
    .select({ message: I.message })
    .from(I)
    .where(and(eq(I.productId, issue.productId), eq(I.check, issue.check), eq(I.status, 'open')))
    .limit(1)
  const resolved = !still
  await writeSyncLog({
    job: RECHECK_JOB,
    runId,
    channel: 'ebay',
    action: 'mark_fixed',
    success: true,
    productId: issue.productId,
    durationMs: Date.now() - started,
    details: { issueId, resolved, refreshed: refresh.refreshed, errors: refresh.errors.length, ebayCalls: ids.length },
  })
  return still ? { status: 'still_open', message: still.message } : { status: 'resolved' }
}

export interface RecheckResult {
  runId: string
  products: number
  refreshed: number
  errors: number
  scan: QualityScanResult
  durationMs: number
}

/** הריצה היומית: כל המוצרים עם ממצא פתוח נקראים מחדש מ-eBay, ואז סריקה מלאה */
export async function recheckOpenIssues(opts: { limit?: number } = {}): Promise<RecheckResult> {
  return withJobLock(RECHECK_JOB, async () => {
    const started = Date.now()
    const runId = randomUUID()
    const open = await db.selectDistinct({ productId: I.productId }).from(I).where(eq(I.status, 'open'))
    const ids = open.map((r) => r.productId).slice(0, Math.max(0, Math.min(opts.limit ?? 1000, 1000)))
    const refresh = await refreshFromEbay(ids, runId)
    const scan = await scanWhenFree()
    const result: RecheckResult = { runId, products: ids.length, refreshed: refresh.refreshed, errors: refresh.errors.length, scan, durationMs: Date.now() - started }
    await writeSyncLog({
      job: RECHECK_JOB,
      runId,
      channel: 'ebay',
      action: 'run',
      success: refresh.errors.length === 0,
      error: refresh.errors.length ? `${refresh.errors.length} מודעות לא נקראו מ-eBay` : undefined,
      durationMs: result.durationMs,
      details: { products: ids.length, refreshed: refresh.refreshed, errors: refresh.errors.length, ebayCalls: ids.length, resolved: scan.resolved, reopened: scan.reopened, created: scan.created },
    })
    return result
  })
}
