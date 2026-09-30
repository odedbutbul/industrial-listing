import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getSellerListShippingPage, type SellerListItem, type ShippingCosts } from '@/lib/ebay/trading'
import type { ImportProgress } from './import-ebay'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// מחירי משלוח ומחיר המודעה מ-eBay לכל המוצרים — קריאה בלבד (GetSellerList, 200 מודעות לקריאה, ~34 קריאות ל-6,600 מודעות).
// נשמר ב-products.shipping_costs וב-products.price (מחיר רק במודעת מחיר קבוע, ורק כשהשתנה — כל שינוי נרשם בלוג).
// לא נוגע במלאי ולא בחנות. העדכון לחנות: lib/sync/woo-shipping.ts.
//   dryRun: קורא מ-eBay ומסכם, בלי לכתוב ל-DB.

export const SHIPPING_JOB = 'shipping-costs'

export interface ShippingRunResult {
  runId: string
  dryRun: boolean
  pagesRead: number
  totalOnEbay: number
  ebayCalls: number
  updated: number
  /** מודעות ב-eBay שאין להן מוצר במערכת (למשל SKU כפול שדולג בייבוא) */
  notInSystem: number
  /** מוצרים שהמחיר שלהם ב-eBay שונה מהמחיר במערכת */
  priceChanged: number
  /** עד 20 דוגמאות: מה היה ← מה יהיה */
  priceChanges: { itemId: string; sku: string | null; from: string | null; to: string }[]
  /** כמה מוצרים לפי סוג המחיר */
  summary: { usFixed: number; usFree: number; usCalculated: number; usNone: number; intlFixed: number; intlFree: number; intlCalculated: number; intlGlobalShipping: number; intlNone: number }
  /** דוגמאות מהתשובה — לבדיקה ב-dry-run */
  samples: SellerListItem[]
  errors: { page: number; error: string }[]
  durationMs: number
}

function tally(summary: ShippingRunResult['summary'], c: ShippingCosts | null) {
  if (!c?.us) summary.usNone++
  else if (c.us.free) summary.usFree++
  else if (c.us.cost === null) summary.usCalculated++
  else summary.usFixed++

  if (c?.intl) {
    if (c.intl.free) summary.intlFree++
    else if (c.intl.cost === null) summary.intlCalculated++
    else summary.intlFixed++
  } else if (c?.globalShipping) summary.intlGlobalShipping++
  else summary.intlNone++
}

const FIXED_PRICE = new Set(['FixedPriceItem', 'StoresFixedPrice'])

/** המחיר מ-eBay, אם צריך לעדכן אותו במערכת. רק מודעת מחיר קבוע (במכירה פומבית CurrentPrice הוא ההצעה), רק מחיר חיובי. */
export function priceUpdate(item: Pick<SellerListItem, 'price' | 'listingType'>, current: string | null): string | null {
  if (!item.price || !FIXED_PRICE.has(item.listingType ?? '')) return null
  const next = Number(item.price)
  if (!Number.isFinite(next) || next <= 0) return null
  return current !== null && Number(current) === next ? null : next.toFixed(2)
}

export async function fetchShippingCosts(opts: { dryRun?: boolean; maxPages?: number; perPage?: number; onProgress?: (p: ImportProgress) => void } = {}): Promise<ShippingRunResult> {
  return withJobLock(SHIPPING_JOB, async () => {
    const started = Date.now()
    const runId = randomUUID()
    const dryRun = !!opts.dryRun
    const result: ShippingRunResult = {
      runId,
      dryRun,
      pagesRead: 0,
      totalOnEbay: 0,
      ebayCalls: 0,
      updated: 0,
      notInSystem: 0,
      priceChanged: 0,
      priceChanges: [],
      summary: { usFixed: 0, usFree: 0, usCalculated: 0, usNone: 0, intlFixed: 0, intlFree: 0, intlCalculated: 0, intlGlobalShipping: 0, intlNone: 0 },
      samples: [],
      errors: [],
      durationMs: 0,
    }
    // אותו חלון זמן לכל הדפים, כדי שהעימוד לא יזוז בין קריאות
    const now = new Date()
    let totalPages = 1
    for (let page = 1; page <= totalPages && (!opts.maxPages || page <= opts.maxPages); page++) {
      let items
      try {
        result.ebayCalls++
        const r = await getSellerListShippingPage(page, opts.perPage ?? 200, now)
        totalPages = r.totalPages
        result.totalOnEbay = r.totalEntries
        items = r.items
        result.pagesRead++
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        result.errors.push({ page, error })
        await writeSyncLog({ job: SHIPPING_JOB, runId, channel: 'ebay', action: 'get_seller_list', success: false, error, details: { page } })
        // בלי הדף הזה אין לנו את מספר הדפים — בדף הראשון עוצרים
        if (page === 1) break
        continue
      }

      if (result.samples.length < 5) result.samples.push(...items.slice(0, 5 - result.samples.length))
      const mappings = items.length
        ? await db
            .select({ productId: schema.channelMappings.productId, itemId: schema.channelMappings.ebayItemId, price: schema.products.price })
            .from(schema.channelMappings)
            .innerJoin(schema.products, eq(schema.products.id, schema.channelMappings.productId))
            .where(inArray(schema.channelMappings.ebayItemId, items.map((i) => i.itemId)))
        : []
      const byItem = new Map(mappings.map((m) => [m.itemId, m]))

      const writes: { productId: string; costs: ShippingCosts | null; price: string | null; oldPrice: string | null; itemId: string; sku: string | null }[] = []
      for (const i of items) {
        const m = byItem.get(i.itemId)
        if (!m) {
          result.notInSystem++
          continue
        }
        tally(result.summary, i.shippingCosts)
        const price = priceUpdate(i, m.price)
        if (price !== null) {
          result.priceChanged++
          if (result.priceChanges.length < 20) result.priceChanges.push({ itemId: i.itemId, sku: i.sku, from: m.price, to: price })
        }
        writes.push({ productId: m.productId, costs: i.shippingCosts, price, oldPrice: m.price, itemId: i.itemId, sku: i.sku })
      }
      if (!dryRun && writes.length) {
        const at = new Date()
        await db.transaction(async (tx) => {
          for (const w of writes)
            await tx
              .update(schema.products)
              .set({ shippingCosts: w.costs, shippingCostsFetchedAt: at, ...(w.price !== null ? { price: w.price, updatedAt: at } : {}) })
              .where(eq(schema.products.id, w.productId))
        })
        await writeSyncLog(
          writes
            .filter((x) => x.price !== null)
            .map((w) => ({ job: SHIPPING_JOB, runId, channel: 'ebay' as const, action: 'price_change', productId: w.productId, success: true, details: { itemId: w.itemId, sku: w.sku, from: w.oldPrice, to: w.price } })),
        )
      }
      result.updated += dryRun ? 0 : writes.length
      opts.onProgress?.({ phase: 'pages', done: page, total: totalPages })
    }

    result.durationMs = Date.now() - started
    if (!dryRun)
      await writeSyncLog({
        job: SHIPPING_JOB,
        runId,
        channel: 'ebay',
        action: 'run',
        success: result.errors.length === 0,
        error: result.errors.length ? `${result.errors.length} דפים לא נקראו` : undefined,
        durationMs: result.durationMs,
        details: { pagesRead: result.pagesRead, totalOnEbay: result.totalOnEbay, updated: result.updated, priceChanged: result.priceChanged, notInSystem: result.notInSystem, ebayCalls: result.ebayCalls, ...result.summary },
      })
    return result
  })
}
