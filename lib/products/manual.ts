import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { ShippingCosts, ShippingOption } from '@/lib/ebay/trading'
import { writeSyncLog } from '@/lib/sync/log'
import { deleteRemovedMedia, productMedia } from './media'
import { CONDITIONS, emptyShip, expirationInput, expirationLabel, SPEC_NAMES,  SHIP_SERVICE, validateManualProduct, type FieldErrors, type ManualProductInput, type ShipInput } from './manual-shared'

// מוצר ידני: נוצר במערכת, לא קשור ל-eBay (אין ebay_item_id), נשלח לחנות בלבד.
// המלאי נרשם ב-ledger כמו כל מוצר: פתיחה = initial, שינוי בעריכה = manual_adjust.

export const MANUAL_JOB = 'manual_product'
const { products, channelMappings, stockLedger, mediaFiles } = schema

export class ManualProductError extends Error {
  constructor(message: string, readonly status = 400, readonly fields: FieldErrors = {}) {
    super(message)
  }
}

// ── HTML מהעורך ──────────────────────────────────────────────────────────────

/** ניקוי בסיסי: בלי script/style/iframe, בלי on*=, בלי javascript:. WordPress מנקה שוב בשמירה (kses). */
export function sanitizeHtml(html: string): string {
  const out = html
    .replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|meta|link)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .trim()
  // עורך ריק מחזיר <p></p>
  return out.replace(/<p>\s*<\/p>/g, '') === '' ? '' : out
}

// ── משלוח: שדות הטופס ↔ ShippingCosts (אותו מבנה של מוצרי eBay → אותם meta בחנות) ──

const money2 = (v: string) => Number(v).toFixed(2)

/** שירות אחד. cost 0 = חינם */
function option(service: string, cost: string, additional: string, shipTo: string[]): ShippingOption {
  if (Number(cost) === 0) return { service, cost: '0.00', additionalCost: null, free: true, shipTo }
  return { service, cost: money2(cost), additionalCost: additional ? money2(additional) : null, free: false, shipTo }
}

/** צד אחד → השירותים שלו: Standard ראשון (הוא שנכנס ל-_ship_us / _ship_intl), ואקספרס אם הוגדר */
function sideOptions(s: ShipInput, names: { standard: string; express: string }, shipTo: string[]): ShippingOption[] {
  if (s.mode === 'none') return []
  const out = [option(names.standard, s.mode === 'free' ? '0' : s.cost, s.mode === 'free' ? '' : s.additional, shipTo)]
  if (s.express) out.push(option(names.express, s.expressCost, s.expressAdditional, shipTo))
  return out
}

export function toShippingCosts(sh: ManualProductInput['shipping']): ShippingCosts {
  const domestic = sideOptions(sh.us, SHIP_SERVICE.us, ['US'])
  const international = sideOptions(sh.intl, SHIP_SERVICE.intl, ['Worldwide'])
  return {
    type: 'Flat',
    currency: 'USD',
    us: domestic[0] ?? null,
    intl: international[0] ?? null,
    domestic,
    international,
    globalShipping: false,
    excludeLocations: sh.exclude,
    policyName: null,
  }
}

function fromSide(list: ShippingOption[] | undefined, names: { standard: string; express: string }): ShipInput {
  const std = list?.find((o) => o.service === names.standard)
  const exp = list?.find((o) => o.service === names.express)
  const out = emptyShip()
  if (!std) return { ...out, mode: 'none' }
  if (std.free) out.mode = 'free'
  else Object.assign(out, { mode: 'flat', cost: std.cost ?? '', additional: std.additionalCost ?? '' })
  if (exp) Object.assign(out, { express: true, expressCost: exp.free ? '0.00' : exp.cost ?? '', expressAdditional: exp.additionalCost ?? '' })
  return out
}

// ── שמירה ───────────────────────────────────────────────────────────────────

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')
const orNull = (s: string) => (s.trim() ? s.trim() : null)
const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`) : null)
const conditionLabel = (id: string) => CONDITIONS.find(([c]) => c === id)?.[1] ?? null

/** תמונות לפי הסדר → הכתובות שלהן בחנות. מזהה שלא קיים / שייך למוצר אחר נדחה. */
async function resolveImages(ids: string[], productId: string | null): Promise<string[]> {
  if (!ids.length) return []
  if (new Set(ids).size !== ids.length) throw new ManualProductError('אותה תמונה מופיעה פעמיים', 400, { images: 'אותה תמונה מופיעה פעמיים' })
  const rows = await db
    .select({ id: mediaFiles.id, wooSrc: mediaFiles.wooSrc })
    .from(mediaFiles)
    .where(and(inArray(mediaFiles.id, ids), productId ? or(isNull(mediaFiles.productId), eq(mediaFiles.productId, productId)) : isNull(mediaFiles.productId)))
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => {
    const r = byId.get(id)
    if (!r) throw new ManualProductError('אחת התמונות לא נמצאה — העלה אותה שוב', 400, { images: 'אחת התמונות לא נמצאה — העלה אותה שוב' })
    return r.wooSrc
  })
}

function productValues(p: ManualProductInput, images: string[]) {
  const specifics: Record<string, string[]> = {}
  // שדות קבועים בלבד, באותם שמות כמו ה-Item Specifics של מוצרי eBay
  const spec = { model: clean(p.specs.model), countryOfOrigin: p.specs.countryOfOrigin, type: clean(p.specs.type), expirationDate: expirationLabel(p.specs.expirationDate) }
  for (const k of Object.keys(SPEC_NAMES) as (keyof typeof SPEC_NAMES)[]) if (spec[k]) specifics[SPEC_NAMES[k]] = [spec[k]]
  const brands = p.brands.map(clean).filter(Boolean)
  if (brands.length) specifics.Brand = brands
  if (p.mpn.trim()) specifics.MPN = [clean(p.mpn)]
  const dims = { weight: p.dims.weight.trim(), length: p.dims.length.trim(), width: p.dims.width.trim(), height: p.dims.height.trim() }
  return {
    source: 'manual' as const,
    title: clean(p.title),
    shortDescription: orNull(p.shortDescription),
    description: sanitizeHtml(p.description) || null,
    price: p.price ? Number(p.price).toFixed(2) : null,
    salePrice: p.salePrice ? Number(p.salePrice).toFixed(2) : null,
    saleFrom: day(p.saleFrom),
    saleTo: day(p.saleTo),
    currency: 'USD',
    images,
    brand: brands[0] ?? null,
    mpn: orNull(clean(p.mpn)),
    conditionId: orNull(p.conditionId),
    condition: conditionLabel(p.conditionId),
    conditionDescription: orNull(p.conditionNotes),
    itemSpecifics: Object.keys(specifics).length ? specifics : null,
    categorySlugs: p.categorySlugs,
    tags: Array.from(new Set(p.tags.map(clean).filter(Boolean))),
    packageDims: Object.values(dims).some(Boolean) ? dims : null,
    shippingCosts: toShippingCosts(p.shipping),
    shippingCostsFetchedAt: new Date(),
    faq: p.faq.map((f) => ({ q: clean(f.q), a: f.a.trim() })).filter((f) => f.q && f.a),
    // רק לתמונות שעדיין במוצר
    imageAlts: Object.fromEntries(Object.entries(p.imageAlts).filter(([id, alt]) => p.imageIds.includes(id) && alt.trim()).map(([id, alt]) => [id, clean(alt)])),
    primaryCategory: p.primaryCategory && p.categorySlugs.includes(p.primaryCategory) ? p.primaryCategory : null,
  }
}

function check(p: ManualProductInput) {
  const errors = validateManualProduct(p)
  if (Object.keys(errors).length) throw new ManualProductError('יש שדות שצריך לתקן', 400, errors)
}

async function skuTaken(sku: string, exceptProductId: string | null) {
  const row = await db.query.channelMappings.findFirst({ where: eq(channelMappings.sku, sku) })
  return !!row && row.productId !== exceptProductId
}

export async function createManualProduct(p: ManualProductInput): Promise<{ id: string }> {
  check(p)
  const sku = p.sku.trim()
  if (await skuTaken(sku, null)) throw new ManualProductError('ה-SKU כבר קיים במערכת', 409, { sku: 'ה-SKU כבר קיים במערכת — בחר אחר' })
  const images = await resolveImages(p.imageIds, null)

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(products).values(productValues(p, images)).returning({ id: products.id })
    await tx.insert(channelMappings).values({ productId: row.id, sku })
    if (p.quantity > 0)
      await tx.insert(stockLedger).values({ productId: row.id, delta: p.quantity, source: 'manual', reason: 'initial', idempotencyKey: `manual:initial:${row.id}`, note: 'מלאי פתיחה — מוצר ידני' })
    if (p.imageIds.length) await tx.update(mediaFiles).set({ productId: row.id }).where(inArray(mediaFiles.id, p.imageIds))
    return row.id
  })
  await writeSyncLog({ job: MANUAL_JOB, action: 'create_manual', productId: id, success: true, details: { sku, qty: p.quantity, images: images.length } })
  return { id }
}

/**
 * עדכון מוצר ידני. expectedAvailable = המלאי כפי שהיה כשהטופס נטען: אם בינתיים נמכר משהו,
 * לא דורסים — מחזירים 409 כדי לטעון מחדש.
 */
export async function updateManualProduct(id: string, p: ManualProductInput, expectedAvailable: number): Promise<void> {
  check(p)
  const sku = p.sku.trim()
  const existing = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!existing) throw new ManualProductError('המוצר לא נמצא', 404)
  if (existing.source !== 'manual') throw new ManualProductError('אפשר לערוך כאן רק מוצרים ידניים — מוצרי eBay מתעדכנים מ-eBay', 400)
  const mapping = await db.query.channelMappings.findFirst({ where: eq(channelMappings.productId, id) })
  if (!mapping) throw new ManualProductError('למוצר אין SKU במערכת', 500)
  if (sku !== mapping.sku) {
    if (mapping.wooProductId) throw new ManualProductError('אי אפשר לשנות SKU של מוצר שכבר בחנות', 400, { sku: 'המוצר כבר בחנות — ה-SKU נעול' })
    if (await skuTaken(sku, id)) throw new ManualProductError('ה-SKU כבר קיים במערכת', 409, { sku: 'ה-SKU כבר קיים במערכת — בחר אחר' })
  }
  const images = await resolveImages(p.imageIds, id)

  let delta = 0
  await db.transaction(async (tx) => {
    // נעילת שורת המוצר — אותו סדר כמו קליטת הזמנה, כדי שמכירה ועריכה לא ייכתבו במקביל
    await tx.execute(sql`select id from ${products} where id = ${id} for update`)
    const [{ available }] = await tx
      .select({ available: sql<number>`coalesce(sum(${stockLedger.delta}), 0)::int` })
      .from(stockLedger)
      .where(eq(stockLedger.productId, id))
    if (available !== expectedAvailable) throw new ManualProductError(`המלאי השתנה בזמן העריכה (עכשיו ${available}). טען את הדף מחדש ובדוק לפני שמירה`, 409)
    delta = p.quantity - available
    await tx.update(products).set(productValues(p, images)).where(eq(products.id, id))
    if (sku !== mapping.sku) await tx.update(channelMappings).set({ sku }).where(eq(channelMappings.productId, id))
    if (delta !== 0)
      await tx.insert(stockLedger).values({ productId: id, delta, source: 'manual', reason: 'manual_adjust', idempotencyKey: `manual:adjust:${randomUUID()}`, note: 'עריכת מוצר ידני' })
    if (p.imageIds.length) await tx.update(mediaFiles).set({ productId: id }).where(inArray(mediaFiles.id, p.imageIds))
  })
  await writeSyncLog({ job: MANUAL_JOB, action: 'update_manual', productId: id, success: true, details: { sku, qtyDelta: delta, images: images.length } })
  // תמונות שהוסרו: מוצר שעוד לא בחנות — נמחקות מספריית המדיה עכשיו. מוצר בחנות — אחרי העדכון הבא בחנות,
  // כדי שהמוצר בחנות לא יצביע על תמונה שנמחקה
  if (!mapping.wooProductId) await deleteRemovedMedia(id, p.imageIds)
}

// ── טעינה לטופס ─────────────────────────────────────────────────────────────

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')

export async function loadManualProduct(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const p = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!p || p.source !== 'manual') return null
  const m = await db.query.channelMappings.findFirst({ where: eq(channelMappings.productId, id) })
  const [{ available }] = await db
    .select({ available: sql<number>`coalesce(sum(${stockLedger.delta}), 0)::int` })
    .from(stockLedger)
    .where(eq(stockLedger.productId, id))
  const media = await productMedia(id, p.images)
  const imageIds = media.map((x) => x.id)
  const specifics = { ...(p.itemSpecifics ?? {}) }
  const brandList = specifics.Brand ?? []
  delete specifics.Brand
  delete specifics.MPN
  const input: ManualProductInput = {
    title: p.title,
    shortDescription: p.shortDescription ?? '',
    description: p.description ?? '',
    sku: m?.sku ?? '',
    price: p.price ?? '',
    salePrice: p.salePrice ?? '',
    saleFrom: isoDay(p.saleFrom),
    saleTo: isoDay(p.saleTo),
    quantity: Math.max(available, 0),
    brands: brandList.length ? brandList : p.brand ? [p.brand] : [],
    mpn: p.mpn ?? '',
    conditionId: p.conditionId ?? '',
    conditionNotes: p.conditionDescription ?? '',
    categorySlugs: p.categorySlugs ?? [],
    tags: p.tags ?? [],
    specs: {
      model: specifics[SPEC_NAMES.model]?.[0] ?? '',
      countryOfOrigin: specifics[SPEC_NAMES.countryOfOrigin]?.[0] ?? '',
      type: specifics[SPEC_NAMES.type]?.[0] ?? '',
      expirationDate: expirationInput(specifics[SPEC_NAMES.expirationDate]?.[0] ?? ''),
    },
    imageIds,
    shipping: { us: fromSide(p.shippingCosts?.domestic, SHIP_SERVICE.us), intl: fromSide(p.shippingCosts?.international, SHIP_SERVICE.intl), exclude: p.shippingCosts?.excludeLocations ?? [] },
    dims: p.packageDims ?? { weight: '', length: '', width: '', height: '' },
    faq: p.faq ?? [],
    imageAlts: p.imageAlts ?? {},
    primaryCategory: p.primaryCategory ?? '',
  }
  return {
    input,
    available,
    images: media.map((x) => ({ id: x.id, fileName: x.fileName, width: x.width, height: x.height, size: x.size, url: x.wooSrc })),
    wooProductId: m?.wooProductId ?? null,
    lastSyncedAt: m?.lastSyncedAt ?? null,
    updatedAt: p.updatedAt,
  }
}
