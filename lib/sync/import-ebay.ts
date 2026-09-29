import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getActiveListingsPage, getItem, type ActiveListingSummary } from '@/lib/ebay/trading'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// ייבוא מודעות פעילות מ-eBay ל-Postgres. קריאה בלבד מול eBay.
//
// שלב 1 — importEbayListings: רק GetMyeBaySelling (200 מודעות לקריאה; ~34 קריאות לחנות של 6,600).
//   מספיק לסנכרון מלאי: ItemID, SKU, כמות זמינה, כותרת, מחיר, תמונה ראשית.
//   - מוצר חדש: products + channel_mappings + מלאי פתיחה ב-ledger (פעם אחת, לפי idempotency key).
//   - מוצר קיים: לא נוגעים ב-ledger. פער בין ה-ledger לכמות ב-eBay מדווח (התיקון — job ההתאמה).
//   - וריאציות / SKU כפול: מדולגים ומדווחים.
//   - dryRun: אין שום כתיבה ל-DB.
// שלב 2 — enrichProductDetails: GetItem למוצרים בלי פרטים מלאים, במנות מוגבלות (מכסת קריאות יומית של eBay).

export const IMPORT_JOB = 'import-ebay'
export const ENRICH_JOB = 'enrich-ebay'

export interface ImportProgress {
  phase: 'pages' | 'writing' | 'details'
  done: number
  total: number
}

export interface ImportOptions {
  dryRun?: boolean
  /** הגבלת מספר דפים — לבדיקות */
  maxPages?: number
  onProgress?: (p: ImportProgress) => void
}

export interface ImportResult {
  runId: string
  dryRun: boolean
  pagesRead: number
  totalOnEbay: number
  ebayCalls: number
  created: number
  unchanged: number
  skipped: { itemId: string; reason: string; detail?: string }[]
  mismatches: { itemId: string; sku: string; ledgerQty: number; ebayQty: number }[]
  errors: { itemId: string; error: string }[]
  generatedSkus: { itemId: string; sku: string }[]
  durationMs: number
}

/** SKU אחרי ניקוי. אם אין SKU ב-eBay — מזהה פנימי יציב (לא נכתב חזרה ל-eBay). */
function resolveSku(summary: ActiveListingSummary): { sku: string; generated: boolean } {
  const raw = (summary.sku ?? '').trim()
  if (raw) return { sku: raw, generated: false }
  return { sku: `EBAY-${summary.itemId}`, generated: true }
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

async function ledgerAvailable(productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const ids of chunk(productIds, 1000)) {
    const rows = await db
      .select({ productId: schema.stockLedger.productId, qty: sql<number>`coalesce(sum(${schema.stockLedger.delta}), 0)::int` })
      .from(schema.stockLedger)
      .where(inArray(schema.stockLedger.productId, ids))
      .groupBy(schema.stockLedger.productId)
    for (const r of rows) out.set(r.productId, r.qty)
  }
  return out
}

export async function importEbayListings(opts: ImportOptions = {}): Promise<ImportResult> {
  return withJobLock(IMPORT_JOB, () => runImport(opts))
}

async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const started = Date.now()
  const dryRun = !!opts.dryRun
  const progress = opts.onProgress ?? (() => {})
  const result: ImportResult = {
    runId: randomUUID(),
    dryRun,
    pagesRead: 0,
    totalOnEbay: 0,
    ebayCalls: 0,
    created: 0,
    unchanged: 0,
    skipped: [],
    mismatches: [],
    errors: [],
    generatedSkus: [],
    durationMs: 0,
  }
  const log = (entries: Omit<typeof schema.syncLog.$inferInsert, 'job' | 'runId' | 'channel'>[]) =>
    dryRun ? Promise.resolve() : writeSyncLog(entries.map((e) => ({ job: IMPORT_JOB, runId: result.runId, channel: 'ebay' as const, ...e })))

  // 1. כל המודעות הפעילות
  const summaries: ActiveListingSummary[] = []
  let page = 1
  let totalPages = 1
  do {
    const p = await getActiveListingsPage(page)
    result.ebayCalls++
    summaries.push(...p.items)
    totalPages = opts.maxPages ? Math.min(p.totalPages, opts.maxPages) : p.totalPages
    result.totalOnEbay = p.totalEntries
    result.pagesRead = page
    progress({ phase: 'pages', done: page, total: totalPages })
    page++
  } while (page <= totalPages)

  // מודעה שמופיעה פעמיים (דפדוף תוך כדי שינוי ב-eBay) — פעם אחת בלבד
  const seen = new Set<string>()
  const listings = summaries.filter((s) => (seen.has(s.itemId) ? false : (seen.add(s.itemId), true)))

  // 2. מה כבר קיים
  const byItemId = new Map<string, typeof schema.channelMappings.$inferSelect>()
  for (const ids of chunk(listings.map((s) => s.itemId), 1000)) {
    const rows = await db.select().from(schema.channelMappings).where(inArray(schema.channelMappings.ebayItemId, ids))
    for (const m of rows) byItemId.set(m.ebayItemId!, m)
  }
  const available = await ledgerAvailable(Array.from(byItemId.values()).map((m) => m.productId))

  // SKU → מי מחזיק בו (ב-DB)
  const takenSkus = new Map<string, string | null>()
  const candidateSkus = Array.from(new Set(listings.filter((s) => !byItemId.has(s.itemId)).map((s) => resolveSku(s).sku)))
  for (const skus of chunk(candidateSkus, 1000)) {
    const rows = await db
      .select({ sku: schema.channelMappings.sku, ebayItemId: schema.channelMappings.ebayItemId })
      .from(schema.channelMappings)
      .where(inArray(schema.channelMappings.sku, skus))
    for (const r of rows) takenSkus.set(r.sku, r.ebayItemId)
  }
  // SKU שמופיע ביותר ממודעה אחת בריצה הזו — אף אחת מהן לא ממופה (לא מנחשים איזו נכונה)
  const skuCount = new Map<string, number>()
  for (const s of listings) if (!byItemId.has(s.itemId)) skuCount.set(resolveSku(s).sku, (skuCount.get(resolveSku(s).sku) ?? 0) + 1)

  // 3. סיווג וכתיבה
  const toCreate: ActiveListingSummary[] = []
  const qtyUpdates: { id: string; qty: number }[] = []
  for (const s of listings) {
    if (s.hasVariations) {
      result.skipped.push({ itemId: s.itemId, reason: 'variations_unsupported' })
      continue
    }
    const m = byItemId.get(s.itemId)
    if (m) {
      result.unchanged++
      if (s.quantityAvailable !== null) {
        const ledgerQty = available.get(m.productId) ?? 0
        if (ledgerQty !== s.quantityAvailable) result.mismatches.push({ itemId: s.itemId, sku: m.sku, ledgerQty, ebayQty: s.quantityAvailable })
        if (m.lastEbayQty !== s.quantityAvailable) qtyUpdates.push({ id: m.id, qty: s.quantityAvailable })
      }
      continue
    }
    const { sku, generated } = resolveSku(s)
    const owner = takenSkus.get(sku)
    if (owner !== undefined && owner !== s.itemId) {
      result.skipped.push({ itemId: s.itemId, reason: 'duplicate_sku', detail: `SKU ${sku} כבר ממופה למודעה ${owner}` })
      continue
    }
    if ((skuCount.get(sku) ?? 0) > 1) {
      result.skipped.push({ itemId: s.itemId, reason: 'duplicate_sku', detail: `SKU ${sku} מופיע ב-${skuCount.get(sku)} מודעות` })
      continue
    }
    if (s.quantityAvailable === null) {
      result.skipped.push({ itemId: s.itemId, reason: 'no_quantity' })
      continue
    }
    if (generated) result.generatedSkus.push({ itemId: s.itemId, sku })
    toCreate.push(s)
  }
  result.created = toCreate.length

  if (!dryRun) {
    const now = new Date()
    let written = 0
    for (const batch of chunk(toCreate, 100)) {
      try {
        await db.transaction(async (tx) => {
          const products = await tx
            .insert(schema.products)
            .values(
              batch.map((s) => ({
                title: s.title,
                price: s.price,
                currency: s.currency ?? 'USD',
                images: s.galleryUrl ? [s.galleryUrl] : [],
              })),
            )
            .returning({ id: schema.products.id })
          await tx.insert(schema.channelMappings).values(
            batch.map((s, i) => ({
              productId: products[i].id,
              sku: resolveSku(s).sku,
              ebayItemId: s.itemId,
              lastEbayQty: s.quantityAvailable,
              lastSyncedAt: now,
            })),
          )
          const opening = batch
            .map((s, i) => ({ s, productId: products[i].id }))
            .filter(({ s }) => (s.quantityAvailable ?? 0) > 0)
            .map(({ s, productId }) => ({
              productId,
              delta: s.quantityAvailable!,
              source: 'import' as const,
              reason: 'initial' as const,
              idempotencyKey: `ebay:initial:${s.itemId}`,
              note: `מלאי פתיחה מ-eBay (QuantityAvailable ${s.quantityAvailable}${s.totalQty !== null ? ` מתוך ${s.totalQty}` : ''})`,
            }))
          if (opening.length) await tx.insert(schema.stockLedger).values(opening).onConflictDoNothing({ target: schema.stockLedger.idempotencyKey })
          await tx.insert(schema.syncLog).values(
            batch.map((s, i) => ({
              job: IMPORT_JOB,
              runId: result.runId,
              channel: 'ebay' as const,
              action: 'import_item',
              success: true,
              productId: products[i].id,
              details: { itemId: s.itemId, sku: resolveSku(s).sku, qty: s.quantityAvailable },
            })),
          )
        })
      } catch (err) {
        // מנה שנכשלה לא נכתבת בכלל (טרנזקציה) — מדווחים על כל המודעות שבה
        const error = err instanceof Error ? err.message : String(err)
        for (const s of batch) result.errors.push({ itemId: s.itemId, error })
        result.created -= batch.length
        await log([{ action: 'import_batch', success: false, error, details: { itemIds: batch.map((s) => s.itemId) } }])
      }
      written += batch.length
      progress({ phase: 'writing', done: written, total: toCreate.length })
    }

    for (const batch of chunk(qtyUpdates, 500)) {
      await db.transaction(async (tx) => {
        for (const u of batch) {
          await tx.update(schema.channelMappings).set({ lastEbayQty: u.qty, lastSyncedAt: now }).where(eq(schema.channelMappings.id, u.id))
        }
      })
    }
  }

  await log(
    result.mismatches.map((m) => ({ action: 'qty_mismatch', success: false, error: 'ledger != eBay', details: m })),
  )
  await log(
    result.skipped.map((s) => ({ action: 'skip_item', success: false, error: s.reason, details: { itemId: s.itemId, detail: s.detail ?? null } })),
  )

  result.durationMs = Date.now() - started
  await log([
    {
      action: 'run',
      success: result.errors.length === 0,
      error: result.errors.length ? `${result.errors.length} מודעות לא נכתבו` : undefined,
      durationMs: result.durationMs,
      details: {
        pagesRead: result.pagesRead,
        totalOnEbay: result.totalOnEbay,
        ebayCalls: result.ebayCalls,
        created: result.created,
        unchanged: result.unchanged,
        skipped: result.skipped.length,
        mismatches: result.mismatches.length,
        errors: result.errors.length,
        generatedSkus: result.generatedSkus.length,
      },
    },
  ])
  return result
}

// ── שלב 2: פרטים מלאים ───────────────────────────────────────────────────────

export interface EnrichResult {
  runId: string
  requested: number
  enriched: number
  errors: { itemId: string; error: string }[]
  remaining: number
  durationMs: number
}

/**
 * GetItem למוצרים שעוד אין להם פרטים מלאים (תיאור, כל התמונות, מותג, קטגוריה).
 * `limit` שומר על מכסת הקריאות היומית של eBay — המכסה משותפת לכל מה שמשתמש באותו App ID.
 * לא נוגע במלאי.
 */
export async function enrichProductDetails(opts: { limit: number; concurrency?: number; onProgress?: (p: ImportProgress) => void }): Promise<EnrichResult> {
  return withJobLock(ENRICH_JOB, async () => {
    const started = Date.now()
    const runId = randomUUID()
    const limit = Math.max(0, Math.min(opts.limit, 2000))
    const rows = await db
      .select({ productId: schema.products.id, itemId: schema.channelMappings.ebayItemId })
      .from(schema.products)
      .innerJoin(schema.channelMappings, eq(schema.channelMappings.productId, schema.products.id))
      .where(and(isNull(schema.products.detailsFetchedAt), sql`${schema.channelMappings.ebayItemId} is not null`))
      .orderBy(asc(schema.products.createdAt))
      .limit(limit)

    const result: EnrichResult = { runId, requested: rows.length, enriched: 0, errors: [], remaining: 0, durationMs: 0 }
    let next = 0
    let done = 0
    const worker = async () => {
      while (next < rows.length) {
        const r = rows[next++]
        try {
          const d = await getItem(r.itemId!)
          await db
            .update(schema.products)
            .set({
              title: d.title,
              description: d.description,
              condition: d.condition,
              price: d.price,
              currency: d.currency ?? 'USD',
              images: d.images,
              brand: d.brand,
              mpn: d.mpn,
              ebayCategoryId: d.categoryId,
              ebayCategoryName: d.categoryName,
              detailsFetchedAt: new Date(),
            })
            .where(eq(schema.products.id, r.productId))
          result.enriched++
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          result.errors.push({ itemId: r.itemId!, error })
          await writeSyncLog({ job: ENRICH_JOB, runId, channel: 'ebay', action: 'get_item', success: false, error, productId: r.productId, details: { itemId: r.itemId } })
        }
        opts.onProgress?.({ phase: 'details', done: ++done, total: rows.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, rows.length) }, worker))

    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.products).where(isNull(schema.products.detailsFetchedAt))
    result.remaining = n
    result.durationMs = Date.now() - started
    await writeSyncLog({
      job: ENRICH_JOB,
      runId,
      channel: 'ebay',
      action: 'run',
      success: result.errors.length === 0,
      error: result.errors.length ? `${result.errors.length} מודעות לא נקראו` : undefined,
      durationMs: result.durationMs,
      details: { requested: result.requested, enriched: result.enriched, errors: result.errors.length, remaining: result.remaining, ebayCalls: result.requested },
    })
    return result
  })
}
