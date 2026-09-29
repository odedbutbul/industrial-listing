import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { WooApiError, wooRequest } from '@/lib/woo/client'
import {
  brandKey,
  buildWooProduct,
  ensureBrands,
  ensureConditionAttribute,
  findWooProductsBySku,
  loadBrands,
  type SourceProduct,
  type WooProductPayload,
} from '@/lib/woo/products'
import type { ImportProgress } from './import-ebay'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// שליחת מוצרים שעודד בחר לחנות. תמיד ידני: תצוגה מקדימה (קריאה בלבד) → אישור → יצירה כטיוטות.
// מוצר שכבר קיים בחנות עם אותו SKU — מקושר ולא נוצר שוב, והחנות לא משתנה.

export const WOO_PRODUCTS_JOB = 'woo_products'
export const MAX_SELECTION = 200
const BATCH = 10 // כל מוצר מוריד תמונה ראשית — מנות קטנות כדי לא להיתקע ב-timeout

const { products, channelMappings, stockLedger } = schema

export type PlanStatus = 'create' | 'link' | 'skip'

export interface PlanItem {
  productId: string
  title: string
  sku: string
  status: PlanStatus
  /** skip: למה לא; create: אזהרות (חסר מותג, אזל…) */
  notes: string[]
  wooProductId: number | null
}

export interface WooPlan {
  items: PlanItem[]
  counts: Record<PlanStatus, number>
  newBrands: string[]
}

export interface WooPushResult extends WooPlan {
  runId: string
  created: number
  linked: number
  failed: { productId: string; sku: string; error: string }[]
  brandsCreated: string[]
}

async function loadSources(ids: string[]) {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      price: products.price,
      images: products.images,
      brand: products.brand,
      mpn: products.mpn,
      conditionId: products.conditionId,
      condition: products.condition,
      conditionDescription: products.conditionDescription,
      ebayCategoryId: products.ebayCategoryId,
      ebayCategoryName: products.ebayCategoryName,
      itemSpecifics: products.itemSpecifics,
      ebayListingStartedAt: products.ebayListingStartedAt,
      archived: products.archived,
      detailsFetchedAt: products.detailsFetchedAt,
      sku: channelMappings.sku,
      ebayItemId: channelMappings.ebayItemId,
      wooProductId: channelMappings.wooProductId,
      syncEnabled: channelMappings.syncEnabled,
      available: sql<number>`(select coalesce(sum(${stockLedger.delta}), 0)::int from ${stockLedger} where ${stockLedger.productId} = ${products.id})`,
    })
    .from(products)
    .innerJoin(channelMappings, eq(channelMappings.productId, products.id))
    .where(inArray(products.id, ids))
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r)
}

/** שם התצוגה של כל מותג: הכתיב הנפוץ בקטלוג, ועדיפות לכתיב שאינו כולו אותיות גדולות (Lumenis ולא LUMENIS) */
async function brandDisplayNames(keys: Set<string>): Promise<Map<string, string>> {
  const rows = await db
    .select({ brand: products.brand, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(isNotNull(products.brand), eq(products.archived, false)))
    .groupBy(products.brand)
  const best = new Map<string, { name: string; n: number }>()
  for (const r of rows) {
    const k = brandKey(r.brand!)
    if (!keys.has(k)) continue
    const name = r.brand!.trim().replace(/\s+/g, ' ')
    const caps = (x: string) => x === x.toUpperCase()
    const cur = best.get(k)
    if (!cur || (caps(cur.name) && !caps(name)) || (caps(cur.name) === caps(name) && r.n > cur.n)) best.set(k, { name, n: r.n })
  }
  return new Map(Array.from(best, ([k, v]) => [k, v.name]))
}

/** בונה את התוכנית. קריאה בלבד — גם מול החנות (חיפוש SKU ומותגים). */
async function plan(ids: string[]) {
  const sources = await loadSources(ids)
  const existingBySku = await findWooProductsBySku(sources.filter((s) => !s.wooProductId).map((s) => s.sku))
  const brands = await loadBrands()

  const items: PlanItem[] = []
  const brandKeys = new Set<string>()
  for (const s of sources) {
    const base = { productId: s.id, title: s.title, sku: s.sku, wooProductId: s.wooProductId ?? existingBySku.get(s.sku) ?? null }
    const skip = (why: string) => items.push({ ...base, status: 'skip', notes: [why] })
    if (s.wooProductId) skip('כבר מקושר למוצר בחנות')
    else if (s.archived) skip('המוצר בארכיון')
    else if (!s.syncEnabled) skip('הסנכרון כבוי למוצר הזה')
    else if (!s.detailsFetchedAt) skip('עדיין אין פרטים מלאים מ-eBay')
    else if (existingBySku.has(s.sku)) items.push({ ...base, status: 'link', notes: ['קיים בחנות מוצר עם אותו SKU — יקושר, בלי שינוי בחנות'] })
    else {
      const notes: string[] = []
      if (!s.images.length) notes.push('אין תמונה')
      if (!s.brand) notes.push('אין מותג')
      else brandKeys.add(brandKey(s.brand))
      if (!s.price) notes.push('אין מחיר')
      if (s.available <= 0) notes.push('אזל — ייווצר כ"אזל מהמלאי"')
      items.push({ ...base, status: 'create', notes })
    }
  }
  const missing = new Set(Array.from(brandKeys).filter((k) => !brands.has(k)))
  const names = await brandDisplayNames(missing)
  const counts = { create: 0, link: 0, skip: 0 }
  for (const i of items) counts[i.status]++
  return { sources, items, counts, brands, newBrandNames: names }
}

export async function previewWooProducts(ids: string[], onProgress?: (p: ImportProgress) => void): Promise<WooPlan> {
  onProgress?.({ phase: 'pages', done: 0, total: ids.length })
  const p = await plan(ids)
  onProgress?.({ phase: 'pages', done: ids.length, total: ids.length })
  return { items: p.items, counts: p.counts, newBrands: Array.from(p.newBrandNames.values()) }
}

export async function pushWooProducts(ids: string[], onProgress?: (p: ImportProgress) => void): Promise<WooPushResult> {
  return withJobLock(WOO_PRODUCTS_JOB, async () => {
    const runId = randomUUID()
    const started = Date.now()
    const p = await plan(ids)
    const toCreate = p.items.filter((i) => i.status === 'create')
    const toLink = p.items.filter((i) => i.status === 'link')
    const total = toCreate.length + toLink.length
    let done = 0
    onProgress?.({ phase: 'writing', done, total })

    const failed: WooPushResult['failed'] = []
    let created = 0
    let linked = 0

    // קישור למוצרים קיימים — רק אצלנו, בלי לגעת בחנות
    for (const i of toLink) {
      await db.update(channelMappings).set({ wooProductId: i.wooProductId, updatedAt: new Date() }).where(eq(channelMappings.productId, i.productId))
      await writeSyncLog({ runId, job: WOO_PRODUCTS_JOB, channel: 'woo', action: 'link_product', productId: i.productId, success: true, details: { sku: i.sku, wooProductId: i.wooProductId } })
      linked++
      onProgress?.({ phase: 'writing', done: ++done, total })
    }

    let brandsCreated: string[] = []
    if (toCreate.length) {
      const conditionAttributeId = await ensureConditionAttribute()
      brandsCreated = await ensureBrands(p.newBrandNames, p.brands)
      const ctx = { conditionAttributeId, brandIds: p.brands }
      const byId = new Map(p.sources.map((s) => [s.id, s]))

      for (let i = 0; i < toCreate.length; i += BATCH) {
        const chunk = toCreate.slice(i, i + BATCH)
        const payloads = chunk.map((c) => buildWooProduct(byId.get(c.productId) as SourceProduct, ctx))
        let results: ({ id?: number; error?: { message?: string } } | undefined)[]
        try {
          const r = await wooRequest<{ create?: { id?: number; error?: { message?: string } }[] }>('POST', 'products/batch', { body: { create: payloads } })
          results = r.data.create ?? []
        } catch (e) {
          const msg = e instanceof WooApiError ? e.message : 'שגיאה לא צפויה ביצירת המוצרים'
          results = chunk.map(() => ({ error: { message: msg } }))
        }
        for (let j = 0; j < chunk.length; j++) {
          const c = chunk[j]
          const res = results[j]
          const payload: WooProductPayload = payloads[j]
          if (res?.id) {
            await db
              .update(channelMappings)
              .set({ wooProductId: res.id, lastWooQty: payload.stock_quantity, lastSyncedAt: new Date(), updatedAt: new Date() })
              .where(eq(channelMappings.productId, c.productId))
            await writeSyncLog({ runId, job: WOO_PRODUCTS_JOB, channel: 'woo', action: 'create_product', productId: c.productId, success: true, details: { sku: c.sku, wooProductId: res.id, qty: payload.stock_quantity, status: 'draft' } })
            c.wooProductId = res.id
            created++
          } else {
            const error = res?.error?.message ?? 'החנות לא החזירה מזהה למוצר'
            failed.push({ productId: c.productId, sku: c.sku, error })
            await writeSyncLog({ runId, job: WOO_PRODUCTS_JOB, channel: 'woo', action: 'create_product', productId: c.productId, success: false, error, details: { sku: c.sku } })
          }
          onProgress?.({ phase: 'writing', done: ++done, total })
        }
      }
    }

    await writeSyncLog({
      runId,
      job: WOO_PRODUCTS_JOB,
      channel: 'woo',
      action: 'run',
      success: failed.length === 0,
      error: failed.length ? `${failed.length} מוצרים נכשלו` : null,
      details: { selected: ids.length, created, linked, skipped: p.counts.skip, failed: failed.length, brandsCreated },
      durationMs: Date.now() - started,
    })
    return { runId, items: p.items, counts: p.counts, newBrands: Array.from(p.newBrandNames.values()), created, linked, failed, brandsCreated }
  })
}
