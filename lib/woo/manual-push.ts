import { randomUUID } from 'node:crypto'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { mediaIdFromUrl, storeBlockers } from '@/lib/products/manual-shared'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { WooApiError, wooGet, wooRequest } from './client'
import { getWooConfig } from './config'
import { CATEGORY_TREE } from './categorize'
import { brandKey, CONDITION_LABELS, ensureBrands, ensureCategories, ensureConditionAttribute, loadBrands, mpnNorm, shippingMeta } from './products'

// שליחת מוצר ידני לחנות — תמיד בלחיצה של המשתמש, אחד בכל פעם.
// פעם ראשונה: נוצר כטיוטה (החלטת עודד 01/10/2026). אחר כך: עדכון של אותו מוצר, בלי לשנות את הסטטוס בחנות.
// כל התמונות עולות לספריית המדיה של WordPress (בניגוד למוצרי eBay, שם הגלריה נשארת ב-eBay).

export const WOO_MANUAL_JOB = 'woo_manual_product'
const { products, channelMappings, stockLedger, mediaFiles } = schema
/** הורדת תמונות ע"י WordPress לוקחת זמן — כל מוצר מקבל עד 2 דקות */
const PUSH_TIMEOUT_MS = 120_000

export class StorePushError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

type Meta = { key: string; value: unknown }
type WooImage = { id?: number; src?: string; name?: string; alt?: string }

function publicBase(): string {
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, '')
  if (!base) throw new StorePushError('APP_BASE_URL חסר — החנות צריכה כתובת ציבורית כדי להוריד את התמונות', 500)
  return base
}

/** תגיות לפי שם: קיימת → id, אחרת נוצרת */
async function ensureTags(names: string[]): Promise<number[]> {
  const ids: number[] = []
  for (const name of names) {
    const r = await wooGet<{ id: number; name: string }[]>('products/tags', { search: name, per_page: 100, hide_empty: false, _fields: 'id,name' })
    const hit = r.data.find((t) => decode(t.name).toLowerCase() === name.toLowerCase())
    if (hit) ids.push(hit.id)
    else ids.push((await wooRequest<{ id: number }>('POST', 'products/tags', { body: { name } })).data.id)
  }
  return ids
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"')
const wooDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) + 'T00:00:00' : null)

export interface StorePushResult {
  action: 'created' | 'updated'
  wooProductId: number
  images: number
}

export async function pushManualProduct(productId: string): Promise<StorePushResult> {
  return withJobLock(`${WOO_MANUAL_JOB}:${productId}`, async () => {
    const runId = randomUUID()
    const started = Date.now()
    const p = await db.query.products.findFirst({ where: eq(products.id, productId) })
    if (!p) throw new StorePushError('המוצר לא נמצא', 404)
    if (p.source !== 'manual') throw new StorePushError('רק מוצרים ידניים נשלחים מכאן — מוצרי eBay נשלחים ממסך המוצרים', 400)
    const m = await db.query.channelMappings.findFirst({ where: eq(channelMappings.productId, productId) })
    if (!m) throw new StorePushError('למוצר אין SKU במערכת', 500)

    const imageIds = p.images.map(mediaIdFromUrl).filter((x): x is string => !!x)
    const missing = storeBlockers({ title: p.title, price: p.price ?? '', imageIds })
    if (missing.length) throw new StorePushError(`חסר כדי לשלוח לחנות: ${missing.join(', ')}`)

    try {
      getWooConfig()
    } catch {
      throw new StorePushError('החיבור לחנות לא מוגדר (WC_BASE_URL / מפתחות) — ראה הגדרות', 400)
    }

    // SKU תפוס בחנות ע"י מוצר אחר — לא מקשרים ולא דורסים
    if (!m.wooProductId) {
      const r = await wooGet<{ id: number }[]>('products', { sku: m.sku, status: 'any', _fields: 'id' })
      if (r.data.length) throw new StorePushError(`בחנות כבר יש מוצר עם SKU ${m.sku} (#${r.data[0].id}). שנה את ה-SKU כאן ושלח שוב`, 409)
    }

    const [{ available }] = await db
      .select({ available: sql<number>`coalesce(sum(${stockLedger.delta}), 0)::int` })
      .from(stockLedger)
      .where(eq(stockLedger.productId, productId))
    const qty = Math.max(available, 0)

    const media = await db.select({ id: mediaFiles.id, fileName: mediaFiles.fileName, wooMediaId: mediaFiles.wooMediaId }).from(mediaFiles).where(inArray(mediaFiles.id, imageIds))
    const byId = new Map(media.map((x) => [x.id, x]))
    const base = publicBase()
    const alts = p.imageAlts ?? {}
    const images: WooImage[] = imageIds.map((id, i) => {
      const f = byId.get(id)!
      const alt = alts[id] || p.title
      // תמונה שכבר בספריית המדיה של החנות — לפי id, כדי שלא תעלה שוב
      if (f.wooMediaId) return { id: f.wooMediaId, alt }
      return { src: `${base}/api/public/media/${f.id}/${encodeURIComponent(f.fileName)}`, name: i === 0 ? p.title : `${p.title} ${i + 1}`, alt }
    })

    // מאפיינים: Condition גלובלי + מאפיינים חופשיים (בלי Brand/MPN, שיש להם שדות משלהם)
    const attributes: { id?: number; name?: string; options: string[]; visible: boolean; variation: false }[] = []
    const condLabel = p.conditionId ? CONDITION_LABELS[p.conditionId] : null
    if (condLabel) attributes.push({ id: await ensureConditionAttribute(), options: [condLabel], visible: true, variation: false })
    for (const [name, values] of Object.entries(p.itemSpecifics ?? {})) {
      if (['brand', 'mpn'].includes(name.toLowerCase())) continue
      attributes.push({ name, options: values, visible: true, variation: false })
    }

    let brandId: number | undefined
    if (p.brand) {
      const brands = await loadBrands()
      await ensureBrands(new Map([[brandKey(p.brand), p.brand]]), brands)
      brandId = brands.get(brandKey(p.brand))
    }
    let categories: { id: number }[] = []
    let primaryCat: number | undefined
    if (p.categorySlugs?.length) {
      const ids = await ensureCategories()
      categories = p.categorySlugs.map((s) => ids.get(s)).filter((id): id is number => typeof id === 'number').map((id) => ({ id }))
      // ראשית (פירורי לחם — ה-theme קורא את _yoast_wpseo_primary_product_cat): מה שנבחר, אחרת הראשונה שאינה קטגוריית-אב, כמו בשאר המוצרים בחנות
      const roots = new Set(CATEGORY_TREE.filter((c) => !c.parent).map((c) => c.slug))
      const primarySlug = p.primaryCategory ?? p.categorySlugs.find((s) => !roots.has(s)) ?? p.categorySlugs[0]
      primaryCat = ids.get(primarySlug)
    }
    const tags = p.tags?.length ? (await ensureTags(p.tags)).map((id) => ({ id })) : []

    const meta: Meta[] = [
      { key: '_sync_product_id', value: p.id },
      { key: '_sync_source', value: 'manual' },
      { key: '_sync_updated_at', value: new Date().toISOString() },
      { key: '_mpn', value: p.mpn ?? '' },
      { key: '_mpn_norm', value: p.mpn ? mpnNorm(p.mpn) : '' },
      { key: '_condition_notes', value: p.conditionDescription ?? '' },
      ...shippingMeta(p.shippingCosts),
      // שאלות ותשובות של המוצר — אותו שדה שה-theme קורא (inc/product-seo.php). ריק = השאלות הכלליות
      { key: '_vz_faq', value: p.faq?.length ? p.faq : '' },
      ...(primaryCat ? [{ key: '_yoast_wpseo_primary_product_cat', value: String(primaryCat) }] : []),
    ]
    const d = p.packageDims
    const payload = {
      name: p.title,
      type: 'simple',
      sku: m.sku,
      regular_price: p.price ?? '',
      sale_price: p.salePrice ?? '',
      date_on_sale_from: p.salePrice ? wooDate(p.saleFrom) : null,
      date_on_sale_to: p.salePrice ? wooDate(p.saleTo) : null,
      description: p.description ?? '',
      short_description: p.shortDescription ?? '',
      manage_stock: true,
      stock_quantity: qty,
      weight: d?.weight ?? '',
      dimensions: { length: d?.length ?? '', width: d?.width ?? '', height: d?.height ?? '' },
      images,
      attributes,
      categories,
      tags,
      brands: brandId ? [{ id: brandId }] : [],
      meta_data: meta,
    }

    const creating = !m.wooProductId
    let res: { id: number; images?: { id: number; src: string }[] }
    try {
      res = creating
        ? (await wooRequest<typeof res>('POST', 'products', { body: { ...payload, status: 'draft' }, timeoutMs: PUSH_TIMEOUT_MS })).data
        : (await wooRequest<typeof res>('PUT', `products/${m.wooProductId}`, { body: payload, timeoutMs: PUSH_TIMEOUT_MS })).data
    } catch (e) {
      const error = e instanceof WooApiError ? e.message : 'שגיאה לא צפויה מול החנות'
      await writeSyncLog({ runId, job: WOO_MANUAL_JOB, channel: 'woo', action: creating ? 'create_product' : 'update_product', productId, success: false, error, details: { sku: m.sku }, durationMs: Date.now() - started })
      throw new StorePushError(error, 502)
    }

    // ה-attachment של כל תמונה בחנות נשמר אצלנו, לפי הסדר שנשלח
    const got = res.images ?? []
    for (let i = 0; i < imageIds.length && i < got.length; i++) {
      await db.update(mediaFiles).set({ wooMediaId: got[i].id, wooSrc: got[i].src }).where(eq(mediaFiles.id, imageIds[i]))
    }
    // _sync_gallery: אותו שדה שה-theme קורא במוצרי eBay — כאן עם כתובות החנות.
    // _vz_img_alt: alt לכל תמונה לפי "a{attachment id}" — המפתח של ה-theme; ידוע רק אחרי שהחנות הורידה את התמונות
    const gallery = JSON.stringify(got.slice(1).map((g) => g.src))
    const imgAlt: Record<string, string> = {}
    imageIds.forEach((id, i) => {
      if (alts[id] && got[i]) imgAlt[`a${got[i].id}`] = alts[id]
    })
    const after = [
      { key: '_sync_gallery', value: gallery },
      { key: '_vz_img_alt', value: Object.keys(imgAlt).length ? imgAlt : '' },
    ]
    await wooRequest('PUT', `products/${res.id}`, { body: { meta_data: after } }).catch(async (e) => {
      await writeSyncLog({ runId, job: WOO_MANUAL_JOB, channel: 'woo', action: 'update_gallery_meta', productId, success: false, error: e instanceof Error ? e.message : String(e) })
    })

    await db.update(channelMappings).set({ wooProductId: res.id, lastWooQty: qty, lastSyncedAt: new Date() }).where(eq(channelMappings.productId, productId))
    await writeSyncLog({
      runId,
      job: WOO_MANUAL_JOB,
      channel: 'woo',
      action: creating ? 'create_product' : 'update_product',
      productId,
      success: true,
      details: { sku: m.sku, wooProductId: res.id, qty, images: got.length, ...(creating ? { status: 'draft' } : {}) },
      durationMs: Date.now() - started,
    })
    return { action: creating ? 'created' : 'updated', wooProductId: res.id, images: got.length }
  })
}
