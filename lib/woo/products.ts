import { wooGet, wooRequest } from './client'

// בניית מוצר WooCommerce מתוך מוצר במערכת, לפי docs/product-field-map.md.
// תמונות: הראשית נשלחת ל-Woo (יורדת לספריית המדיה), השאר נשמרות ככתובות eBay ב-meta `_sync_gallery`.

/** condition_id של eBay → התווית באתר */
export const CONDITION_LABELS: Record<string, string> = {
  '1000': 'New',
  '1500': 'New – Open Box',
  '2000': 'Certified Refurbished',
  '2500': 'Seller Refurbished',
  '3000': 'Used',
  '7000': 'For Parts / Not Working',
}

/** מפתחות Item Specifics שכבר יושבים בשדות קבועים — לא נכנסים לטבלת המאפיינים */
const FIXED_SPECIFICS = new Set(['brand', 'mpn'])

/** מפתח השוואה למותג: בלי רישיות, רווחים כפולים וסיומות חברה (Inc., Ltd, GmbH…) */
export function brandKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,.]?\s+(inc|ltd|co|corp|corporation|gmbh|llc|company|limited)\.?$/i, '')
    .toLowerCase()
}

/** MPN לחיפוש: אותיות גדולות, בלי רווחים, מקפים ונקודות */
export const mpnNorm = (mpn: string) => mpn.toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface SourceProduct {
  id: string
  title: string
  description: string | null
  price: string | null
  images: string[]
  brand: string | null
  mpn: string | null
  conditionId: string | null
  condition: string | null
  conditionDescription: string | null
  ebayCategoryId: string | null
  ebayCategoryName: string | null
  itemSpecifics: Record<string, string[]> | null
  ebayListingStartedAt: Date | null
  sku: string
  ebayItemId: string | null
  available: number
}

export interface BuildContext {
  conditionAttributeId: number
  /** brandKey → id בחנות */
  brandIds: Map<string, number>
}

type Meta = { key: string; value: string }

export function buildWooProduct(p: SourceProduct, ctx: BuildContext) {
  const meta: Meta[] = [
    { key: '_sync_product_id', value: p.id },
    { key: '_sync_ebay_item_id', value: p.ebayItemId ?? '' },
    { key: '_sync_ebay_category', value: [p.ebayCategoryId, p.ebayCategoryName].filter(Boolean).join(' | ') },
    { key: '_sync_listed_at', value: p.ebayListingStartedAt?.toISOString() ?? '' },
    { key: '_sync_gallery', value: JSON.stringify(p.images.slice(1)) },
  ]
  if (p.mpn) meta.push({ key: '_mpn', value: p.mpn }, { key: '_mpn_norm', value: mpnNorm(p.mpn) })
  if (p.conditionDescription) meta.push({ key: '_condition_notes', value: p.conditionDescription })

  const attributes: { id?: number; name?: string; options: string[]; visible: boolean; variation: false }[] = []
  const condLabel = p.conditionId ? CONDITION_LABELS[p.conditionId] ?? p.condition : p.condition
  if (condLabel) attributes.push({ id: ctx.conditionAttributeId, options: [condLabel], visible: true, variation: false })
  for (const [name, values] of Object.entries(p.itemSpecifics ?? {})) {
    if (FIXED_SPECIFICS.has(name.toLowerCase())) continue
    const options = values.map((v) => v.trim()).filter((v) => v && !(name === 'Country of Origin' && v === 'Unknown'))
    if (options.length) attributes.push({ name, options, visible: true, variation: false })
  }

  const brandId = p.brand ? ctx.brandIds.get(brandKey(p.brand)) : undefined
  const qty = Math.max(p.available, 0)

  return {
    name: p.title,
    type: 'simple',
    status: 'draft',
    sku: p.sku,
    regular_price: p.price ?? '',
    description: p.description ?? '',
    manage_stock: true,
    stock_quantity: qty,
    images: p.images[0] ? [{ src: p.images[0], alt: p.title }] : [],
    attributes,
    brands: brandId ? [{ id: brandId }] : [],
    meta_data: meta,
  }
}

export type WooProductPayload = ReturnType<typeof buildWooProduct>

// ── הכנת החנות: מאפיין Condition ומותגים ────────────────────────────────────

/** מבטיח שקיים מאפיין גלובלי Condition (pa_condition) ושיש לו את כל המונחים. מחזיר את ה-id שלו. */
export async function ensureConditionAttribute(): Promise<number> {
  const { data: attrs } = await wooGet<{ id: number; slug: string }[]>('products/attributes')
  let id = attrs.find((a) => a.slug === 'pa_condition')?.id
  if (!id) {
    const created = await wooRequest<{ id: number }>('POST', 'products/attributes', {
      body: { name: 'Condition', slug: 'condition', type: 'select', order_by: 'menu_order', has_archives: false },
    })
    id = created.data.id
  }
  const { data: terms } = await wooGet<{ name: string }[]>(`products/attributes/${id}/terms`, { per_page: 100 })
  const have = new Set(terms.map((t) => t.name))
  let order = 0
  for (const name of Object.values(CONDITION_LABELS)) {
    order++
    if (!have.has(name)) await wooRequest('POST', `products/attributes/${id}/terms`, { body: { name, menu_order: order } })
  }
  return id
}

/** כל המותגים בחנות: brandKey → id */
export async function loadBrands(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (let page = 1; ; page++) {
    const r = await wooGet<{ id: number; name: string }[]>('products/brands', { per_page: 100, page, hide_empty: false })
    for (const b of r.data) map.set(brandKey(decodeEntities(b.name)), b.id)
    if (!r.totalPages || page >= r.totalPages) break
  }
  return map
}

/** יוצר בחנות מותגים שחסרים. names = שם התצוגה לכל brandKey. */
export async function ensureBrands(names: Map<string, string>, existing: Map<string, number>): Promise<string[]> {
  const created: string[] = []
  for (const [key, name] of Array.from(names)) {
    if (existing.has(key)) continue
    const r = await wooRequest<{ id: number }>('POST', 'products/brands', { body: { name } })
    existing.set(key, r.data.id)
    created.push(name)
  }
  return created
}

/** מוצרים שכבר קיימים בחנות לפי SKU (כולל טיוטות). sku → id */
export async function findWooProductsBySku(skus: string[]): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  for (let i = 0; i < skus.length; i += 20) {
    const chunk = skus.slice(i, i + 20)
    const r = await wooGet<{ id: number; sku: string }[]>('products', { sku: chunk.join(','), status: 'any', per_page: 100, _fields: 'id,sku' })
    for (const p of r.data) if (p.sku) found.set(p.sku, p.id)
  }
  return found
}

// WordPress מחזיר שמות מונחים עם ישויות HTML (&amp;)
const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"')
