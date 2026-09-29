import { randomUUID } from 'node:crypto'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getActiveListingsPage, getItem, type ActiveListingSummary, type EbayItemDetail } from '@/lib/ebay/trading'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// ייבוא מודעות פעילות מ-eBay ל-Postgres. קריאה בלבד מול eBay (GetMyeBaySelling + GetItem).
//
// - מוצר חדש: products + channel_mappings + רשומת מלאי פתיחה ב-ledger (פעם אחת, לפי idempotency key).
// - מוצר קיים: לא נוגעים ב-ledger. משווים את הכמות ב-eBay למלאי ב-ledger ומדווחים על פער
//   (התיקון הוא עניין של job ההתאמה, לא של הייבוא).
// - מודעות עם וריאציות: מדולגות ומדווחות (לא נתמך בגרסה הזו).
// - dryRun: אין שום כתיבה ל-DB.

export const IMPORT_JOB = 'import-ebay'

export interface ImportOptions {
  dryRun?: boolean
  /** לקרוא GetItem גם למוצרים קיימים ולעדכן את פרטיהם (לא את המלאי) */
  refreshExisting?: boolean
  /** הגבלת מספר דפים (200 מודעות לדף) — לבדיקות */
  maxPages?: number
  /** קריאות GetItem במקביל */
  concurrency?: number
}

export interface ImportResult {
  runId: string
  dryRun: boolean
  pagesRead: number
  totalOnEbay: number
  created: number
  updated: number
  unchanged: number
  skipped: { itemId: string; reason: string; detail?: string }[]
  mismatches: { itemId: string; sku: string; ledgerQty: number; ebayQty: number }[]
  errors: { itemId: string; error: string }[]
  generatedSkus: { itemId: string; sku: string }[]
  durationMs: number
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** SKU אחרי ניקוי. אם אין SKU ב-eBay — מזהה פנימי יציב (לא נכתב חזרה ל-eBay). */
function resolveSku(detail: EbayItemDetail | null, summary: ActiveListingSummary): { sku: string; generated: boolean } {
  const raw = (detail?.sku ?? summary.sku ?? '').trim()
  if (raw) return { sku: raw, generated: false }
  return { sku: `EBAY-${summary.itemId}`, generated: true }
}

async function ledgerAvailable(productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map()
  const rows = await db
    .select({ productId: schema.stockLedger.productId, qty: sql<number>`coalesce(sum(${schema.stockLedger.delta}), 0)::int` })
    .from(schema.stockLedger)
    .where(inArray(schema.stockLedger.productId, productIds))
    .groupBy(schema.stockLedger.productId)
  return new Map(rows.map((r) => [r.productId, r.qty]))
}

function productFields(d: EbayItemDetail) {
  return {
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
  }
}

export async function importEbayListings(opts: ImportOptions = {}): Promise<ImportResult> {
  return withJobLock(IMPORT_JOB, () => runImport(opts))
}

async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const started = Date.now()
  const dryRun = !!opts.dryRun
  const result: ImportResult = {
    runId: randomUUID(),
    dryRun,
    pagesRead: 0,
    totalOnEbay: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
    mismatches: [],
    errors: [],
    generatedSkus: [],
    durationMs: 0,
  }
  const log = (entry: Omit<typeof schema.syncLog.$inferInsert, 'job' | 'runId' | 'channel'>) =>
    dryRun ? Promise.resolve() : writeSyncLog({ job: IMPORT_JOB, runId: result.runId, channel: 'ebay', ...entry })

  // 1. כל המודעות הפעילות
  const summaries: ActiveListingSummary[] = []
  let page = 1
  let totalPages = 1
  do {
    const p = await getActiveListingsPage(page)
    summaries.push(...p.items)
    totalPages = p.totalPages
    result.totalOnEbay = p.totalEntries
    result.pagesRead = page
    page++
  } while (page <= totalPages && (!opts.maxPages || page <= opts.maxPages))

  // 2. מה כבר קיים
  const itemIds = summaries.map((s) => s.itemId)
  const existing = itemIds.length
    ? await db.select().from(schema.channelMappings).where(inArray(schema.channelMappings.ebayItemId, itemIds))
    : []
  const byItemId = new Map(existing.map((m) => [m.ebayItemId!, m]))
  const available = await ledgerAvailable(existing.map((m) => m.productId))

  // 3. סיווג
  const needDetail: ActiveListingSummary[] = []
  for (const s of summaries) {
    if (s.hasVariations) {
      result.skipped.push({ itemId: s.itemId, reason: 'variations_unsupported' })
      continue
    }
    const m = byItemId.get(s.itemId)
    if (!m) needDetail.push(s)
    else if (opts.refreshExisting) needDetail.push(s)
    else {
      result.unchanged++
      if (s.quantityAvailable !== null) {
        const ledgerQty = available.get(m.productId) ?? 0
        if (ledgerQty !== s.quantityAvailable) {
          result.mismatches.push({ itemId: s.itemId, sku: m.sku, ledgerQty, ebayQty: s.quantityAvailable })
        }
        if (!dryRun) {
          await db
            .update(schema.channelMappings)
            .set({ lastEbayQty: s.quantityAvailable, lastSyncedAt: new Date() })
            .where(eq(schema.channelMappings.id, m.id))
        }
      }
    }
  }

  // 4. GetItem
  const details = await mapWithConcurrency(needDetail, opts.concurrency ?? 4, (s) => getItem(s.itemId))

  // SKUs שכבר תפוסים (ב-DB או בריצה הזו)
  const takenSkus = new Map(existing.map((m) => [m.sku, m.ebayItemId]))
  const newSkus = needDetail
    .map((s, i) => (details[i].status === 'fulfilled' ? resolveSku((details[i] as PromiseFulfilledResult<EbayItemDetail>).value, s).sku : null))
    .filter((x): x is string => !!x)
  if (newSkus.length) {
    const rows = await db
      .select({ sku: schema.channelMappings.sku, ebayItemId: schema.channelMappings.ebayItemId })
      .from(schema.channelMappings)
      .where(inArray(schema.channelMappings.sku, newSkus))
    for (const r of rows) takenSkus.set(r.sku, r.ebayItemId)
  }

  // 5. כתיבה
  for (let i = 0; i < needDetail.length; i++) {
    const s = needDetail[i]
    const d = details[i]
    if (d.status === 'rejected') {
      const error = d.reason instanceof Error ? d.reason.message : String(d.reason)
      result.errors.push({ itemId: s.itemId, error })
      await log({ action: 'get_item', success: false, error, details: { itemId: s.itemId } })
      continue
    }
    const detail = d.value
    if (detail.hasVariations) {
      result.skipped.push({ itemId: s.itemId, reason: 'variations_unsupported' })
      continue
    }
    const { sku, generated } = resolveSku(detail, s)
    const existingMapping = byItemId.get(s.itemId)

    if (!existingMapping) {
      const owner = takenSkus.get(sku)
      if (owner !== undefined && owner !== s.itemId) {
        result.skipped.push({ itemId: s.itemId, reason: 'duplicate_sku', detail: `SKU ${sku} כבר שייך ל-${owner}` })
        await log({ action: 'import_item', success: false, error: 'duplicate_sku', details: { itemId: s.itemId, sku, owner } })
        continue
      }
      takenSkus.set(sku, s.itemId)
      if (generated) result.generatedSkus.push({ itemId: s.itemId, sku })

      if (!dryRun) {
        try {
          const productId = await db.transaction(async (tx) => {
            const [product] = await tx.insert(schema.products).values(productFields(detail)).returning({ id: schema.products.id })
            await tx.insert(schema.channelMappings).values({
              productId: product.id,
              sku,
              ebayItemId: s.itemId,
              lastEbayQty: detail.availableQty,
              lastSyncedAt: new Date(),
            })
            if (detail.availableQty > 0) {
              await tx
                .insert(schema.stockLedger)
                .values({
                  productId: product.id,
                  delta: detail.availableQty,
                  source: 'import',
                  reason: 'initial',
                  idempotencyKey: `ebay:initial:${s.itemId}`,
                  note: `מלאי פתיחה מ-eBay (Quantity ${detail.totalQty ?? '?'} − Sold ${detail.quantitySold ?? 0})`,
                })
                .onConflictDoNothing({ target: schema.stockLedger.idempotencyKey })
            }
            return product.id
          })
          await log({
            action: 'import_item',
            success: true,
            productId,
            details: { itemId: s.itemId, sku, skuGenerated: generated, qty: detail.availableQty },
          })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          result.errors.push({ itemId: s.itemId, error })
          await log({ action: 'import_item', success: false, error, details: { itemId: s.itemId, sku } })
          continue
        }
      }
      result.created++
    } else {
      // refreshExisting: עדכון פרטים בלבד, בלי ledger
      const ledgerQty = available.get(existingMapping.productId) ?? 0
      if (ledgerQty !== detail.availableQty) {
        result.mismatches.push({ itemId: s.itemId, sku: existingMapping.sku, ledgerQty, ebayQty: detail.availableQty })
      }
      if (!dryRun) {
        await db.transaction(async (tx) => {
          await tx.update(schema.products).set(productFields(detail)).where(eq(schema.products.id, existingMapping.productId))
          await tx
            .update(schema.channelMappings)
            .set({ lastEbayQty: detail.availableQty, lastSyncedAt: new Date() })
            .where(eq(schema.channelMappings.id, existingMapping.id))
        })
      }
      result.updated++
    }
  }

  for (const m of result.mismatches) {
    await log({ action: 'qty_mismatch', success: false, error: 'ledger != eBay', details: m })
  }

  result.durationMs = Date.now() - started
  await log({
    action: 'run',
    success: result.errors.length === 0,
    durationMs: result.durationMs,
    details: {
      pagesRead: result.pagesRead,
      totalOnEbay: result.totalOnEbay,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped: result.skipped.length,
      mismatches: result.mismatches.length,
      errors: result.errors.length,
      generatedSkus: result.generatedSkus.length,
    },
  })
  return result
}
