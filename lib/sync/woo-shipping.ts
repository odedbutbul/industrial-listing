import { randomUUID } from 'node:crypto'
import { and, eq, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { WooApiError, wooGet, wooRequest } from '@/lib/woo/client'
import { shippingMeta } from '@/lib/woo/products'
import type { ImportProgress } from './import-ebay'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// מחירי המשלוח מ-eBay → מוצרים שכבר בחנות. תמיד ידני: תצוגה מקדימה (קריאה בלבד מהחנות) → אישור → עדכון.
// בעדכון נשלחים רק שדות ה-meta של המשלוח (`_ship_*`, `_sync_shipping`). מחיר, מלאי, תיאור ותמונות לא נשלחים.

export const WOO_SHIPPING_JOB = 'woo_shipping'
const READ_PAGE = 100
const WRITE_BATCH = 50

export type ShippingSyncStatus = 'update' | 'same' | 'no_data' | 'missing'

export interface ShippingSyncItem {
  productId: string
  title: string
  sku: string
  wooProductId: number
  status: ShippingSyncStatus
  /** מה יש עכשיו בחנות → מה יהיה (ארה"ב / עולם) */
  current: { us: string; intl: string } | null
  next: { us: string; intl: string } | null
}

export interface ShippingSyncPlan {
  items: ShippingSyncItem[]
  counts: Record<ShippingSyncStatus, number>
}

export interface ShippingSyncResult extends ShippingSyncPlan {
  runId: string
  updated: number
  failed: { productId: string; sku: string; error: string }[]
}

type WooMeta = { key: string; value: unknown }

async function readStoreMeta(ids: number[], onProgress?: (p: ImportProgress) => void): Promise<Map<number, Map<string, string>>> {
  const out = new Map<number, Map<string, string>>()
  for (let i = 0; i < ids.length; i += READ_PAGE) {
    const chunk = ids.slice(i, i + READ_PAGE)
    // status=any: גם טיוטות. _fields מצמצם את התשובה ל-id + meta
    const { data } = await wooGet<{ id: number; meta_data?: WooMeta[] }[]>('products', { include: chunk.join(','), per_page: READ_PAGE, status: 'any', _fields: 'id,meta_data' })
    for (const p of data) out.set(p.id, new Map((p.meta_data ?? []).map((m) => [m.key, typeof m.value === 'string' ? m.value : JSON.stringify(m.value)])))
    onProgress?.({ phase: 'pages', done: Math.min(i + READ_PAGE, ids.length), total: ids.length })
  }
  return out
}

/** JSON עם מפתחות ממוינים — Postgres (jsonb) ו-WordPress לא שומרים על סדר המפתחות */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
  return v
}

function sameMeta(have: string | undefined, want: string): boolean {
  if (have === want) return true
  if (have === undefined || !want.startsWith('{')) return false
  try {
    return JSON.stringify(canonical(JSON.parse(have))) === JSON.stringify(canonical(JSON.parse(want)))
  } catch {
    return false
  }
}

async function plan(onProgress?: (p: ImportProgress) => void) {
  const rows = await db
    .select({
      productId: schema.products.id,
      title: schema.products.title,
      sku: schema.channelMappings.sku,
      wooProductId: schema.channelMappings.wooProductId,
      shippingCosts: schema.products.shippingCosts,
    })
    .from(schema.products)
    .innerJoin(schema.channelMappings, eq(schema.channelMappings.productId, schema.products.id))
    .where(and(isNotNull(schema.channelMappings.wooProductId), eq(schema.products.archived, false)))
    .orderBy(schema.channelMappings.wooProductId)

  onProgress?.({ phase: 'pages', done: 0, total: rows.length })
  const store = await readStoreMeta(rows.map((r) => r.wooProductId!), onProgress)

  const items: (ShippingSyncItem & { meta: { key: string; value: string }[] })[] = []
  for (const r of rows) {
    const meta = shippingMeta(r.shippingCosts)
    const next = meta.length ? { us: meta.find((m) => m.key === '_ship_us')!.value, intl: meta.find((m) => m.key === '_ship_intl')!.value } : null
    const have = store.get(r.wooProductId!)
    const current = have && (have.has('_ship_us') || have.has('_ship_intl')) ? { us: have.get('_ship_us') ?? '', intl: have.get('_ship_intl') ?? '' } : null
    const status: ShippingSyncStatus = !have ? 'missing' : !meta.length ? 'no_data' : meta.every((m) => sameMeta(have.get(m.key), m.value)) ? 'same' : 'update'
    items.push({ productId: r.productId, title: r.title, sku: r.sku, wooProductId: r.wooProductId!, status, current, next, meta })
  }
  const counts = { update: 0, same: 0, no_data: 0, missing: 0 }
  for (const i of items) counts[i.status]++
  return { items, counts }
}

const strip = (items: (ShippingSyncItem & { meta?: unknown })[]): ShippingSyncItem[] =>
  items.map((i) => ({ productId: i.productId, title: i.title, sku: i.sku, wooProductId: i.wooProductId, status: i.status, current: i.current, next: i.next }))

export async function previewWooShipping(onProgress?: (p: ImportProgress) => void): Promise<ShippingSyncPlan> {
  const p = await plan(onProgress)
  return { items: strip(p.items), counts: p.counts }
}

export async function pushWooShipping(onProgress?: (p: ImportProgress) => void): Promise<ShippingSyncResult> {
  return withJobLock(WOO_SHIPPING_JOB, async () => {
    const runId = randomUUID()
    const started = Date.now()
    const p = await plan(onProgress)
    const todo = p.items.filter((i) => i.status === 'update')
    const failed: ShippingSyncResult['failed'] = []
    let updated = 0
    onProgress?.({ phase: 'writing', done: 0, total: todo.length })

    for (let i = 0; i < todo.length; i += WRITE_BATCH) {
      const chunk = todo.slice(i, i + WRITE_BATCH)
      // רק id + meta_data. WooCommerce מעדכן meta לפי key ולא נוגע בשאר השדות
      const body = { update: chunk.map((c) => ({ id: c.wooProductId, meta_data: c.meta })) }
      let results: ({ id?: number; error?: { message?: string } } | undefined)[]
      try {
        const r = await wooRequest<{ update?: { id?: number; error?: { message?: string } }[] }>('POST', 'products/batch', { body })
        results = r.data.update ?? []
      } catch (e) {
        const msg = e instanceof WooApiError ? e.message : 'שגיאה לא צפויה בעדכון החנות'
        results = chunk.map(() => ({ error: { message: msg } }))
      }
      for (let j = 0; j < chunk.length; j++) {
        const c = chunk[j]
        const res = results[j]
        if (res?.id && !res.error) {
          updated++
          c.status = 'same'
        } else {
          const error = res?.error?.message ?? 'החנות לא אישרה את העדכון'
          failed.push({ productId: c.productId, sku: c.sku, error })
          await writeSyncLog({ runId, job: WOO_SHIPPING_JOB, channel: 'woo', action: 'update_shipping', productId: c.productId, success: false, error, details: { sku: c.sku, wooProductId: c.wooProductId } })
        }
      }
      onProgress?.({ phase: 'writing', done: Math.min(i + WRITE_BATCH, todo.length), total: todo.length })
    }

    await writeSyncLog({
      runId,
      job: WOO_SHIPPING_JOB,
      channel: 'woo',
      action: 'run',
      success: failed.length === 0,
      error: failed.length ? `${failed.length} מוצרים לא עודכנו` : null,
      details: { planned: todo.length, updated, failed: failed.length, same: p.counts.same, noData: p.counts.no_data, missing: p.counts.missing },
      durationMs: Date.now() - started,
    })
    return { runId, items: strip(p.items), counts: p.counts, updated, failed }
  })
}
