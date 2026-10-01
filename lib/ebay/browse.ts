import { getAppAccessToken } from './app-token'
import { getEbayConfig } from './config'
import { assertEbayRestAllowed } from './guard'
import { EbayApiError } from './trading'

// Buy Browse API — item_summary/search (מודעות של מוכרים אחרים) ו-item/get_item_by_legacy_id (משלוח של מודעה
// למדינה מסוימת). קריאה בלבד (GET).
// שדות ופרמטרים לפי ה-OpenAPI הרשמי של eBay (developer.ebay.com/develop/api/spec/browse_api.json, נבדק 30/09/2026).

type Amount = { value?: string; currency?: string }

interface RawItemSummary {
  itemId: string
  legacyItemId?: string
  title?: string
  price?: Amount
  currentBidPrice?: Amount
  condition?: string
  conditionId?: string
  buyingOptions?: string[]
  seller?: { username?: string; feedbackScore?: number; feedbackPercentage?: string }
  shippingOptions?: RawShippingOption[]
  itemWebUrl?: string
  itemLocation?: { country?: string }
  image?: { imageUrl?: string }
  itemCreationDate?: string
}

interface RawShippingOption {
  shippingCost?: Amount
  shippingCostType?: string
  shippingServiceCode?: string
  minEstimatedDeliveryDate?: string
  maxEstimatedDeliveryDate?: string
}

interface RawSearchResponse {
  total?: number
  itemSummaries?: RawItemSummary[]
  warnings?: { message?: string }[]
}

export interface BrowseItem {
  itemId: string
  legacyItemId: string | null
  title: string
  price: string | null
  currency: string | null
  /** המשלוח הזול ביותר למיקום הקונה שנשלח ב-location. null = eBay לא החזיר מחיר (לא שולח / לא ידוע) */
  shipping: string | null
  shippingType: string | null
  condition: string | null
  conditionId: string | null
  buyingOptions: string[]
  seller: string | null
  sellerFeedbackScore: number | null
  sellerFeedbackPct: string | null
  url: string | null
  country: string | null
  imageUrl: string | null
  listedAt: string | null
}

export interface BrowseSearchResult {
  total: number
  items: BrowseItem[]
}

export interface BrowseSearchParams {
  q: string
  /** מוכרים שלא יחזרו בתוצאות (למשל החשבון שלנו) */
  excludeSellers?: string[]
  /** רק המוכרים האלה */
  sellers?: string[]
  /** מיקום הקונה — eBay מחשב לפיו את המשלוח. לא מסנן: מודעה שלא שולחת לשם חוזרת בלי מחיר משלוח */
  location?: BuyerLocation
  /** רק מודעות ששולחות למדינת הקונה (deliveryCountry). ברירת מחדל: לא — מתחרים לכל היעדים (החלטת עודד 01/10/2026) */
  onlyShipsToLocation?: boolean
  categoryId?: string
  limit?: number
}

export interface BuyerLocation {
  /** ISO-2, למשל US / AU / GB */
  country: string
  zip?: string
}

const PATH = '/buy/browse/v1/item_summary/search'
const ITEM_PATH = '/buy/browse/v1/item/get_item_by_legacy_id'

/** מיקוד מייצג לכל מדינה — חלק מהמודעות (משלוח מחושב) צריכות מיקוד כדי לתת מחיר */
export const DEFAULT_ZIP: Record<string, string> = {
  US: '10001',
  CA: 'M5V 3L9',
  GB: 'SW1A 1AA',
  AU: '2000',
  DE: '10115',
  FR: '75001',
  IT: '00118',
  ES: '28001',
  NL: '1012',
  JP: '100-0001',
  IL: '6100000',
}

function headers(token: string, location?: BuyerLocation): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
  if (location) {
    const zip = location.zip ?? DEFAULT_ZIP[location.country]
    const ctx = `country=${location.country}${zip ? `,zip=${zip}` : ''}`
    h['X-EBAY-C-ENDUSERCTX'] = `contextualLocation=${encodeURIComponent(ctx)}`
  }
  return h
}

function cheapest(options: RawShippingOption[] | undefined): RawShippingOption | null {
  const priced = (options ?? []).filter((o) => o.shippingCost?.value != null && Number.isFinite(Number(o.shippingCost.value)))
  if (!priced.length) return options?.[0] ?? null
  return priced.reduce((a, b) => (Number(b.shippingCost!.value) < Number(a.shippingCost!.value) ? b : a))
}

async function browseGet<T>(path: string, url: URL, location?: BuyerLocation): Promise<T> {
  assertEbayRestAllowed('GET', path)
  const token = await getAppAccessToken()
  const res = await fetch(url, { method: 'GET', headers: headers(token, location), signal: AbortSignal.timeout(30000) })
  const data = (await res.json().catch(() => null)) as (T & { errors?: { message?: string; longMessage?: string }[] }) | null
  if (!res.ok) {
    const first = data?.errors?.[0]
    throw new EbayApiError(first?.longMessage ?? first?.message ?? `eBay HTTP ${res.status}`, `GET ${path}`, data?.errors ?? [])
  }
  return data as T
}

function toItem(r: RawItemSummary): BrowseItem {
  const ship = cheapest(r.shippingOptions)
  const fixedShip = ship?.shippingCost?.value ?? null
  return {
    itemId: r.itemId,
    legacyItemId: r.legacyItemId ?? null,
    title: r.title ?? '',
    price: r.price?.value ?? null,
    currency: r.price?.currency ?? null,
    shipping: fixedShip,
    shippingType: ship?.shippingCostType ?? null,
    condition: r.condition ?? null,
    conditionId: r.conditionId ?? null,
    buyingOptions: r.buyingOptions ?? [],
    seller: r.seller?.username ?? null,
    sellerFeedbackScore: r.seller?.feedbackScore ?? null,
    sellerFeedbackPct: r.seller?.feedbackPercentage ?? null,
    url: r.itemWebUrl ?? null,
    country: r.itemLocation?.country ?? null,
    imageUrl: r.image?.imageUrl ?? null,
    listedAt: r.itemCreationDate ?? null,
  }
}

/** ה-filter של Browse: ערכים מופרדים ב-| בתוך {}. שמות משתמש עם | או } לא נתמכים — מסננים אותם. */
function sellerList(names: string[]): string {
  return names.filter((n) => /^[^|{}]+$/.test(n)).join('|')
}

export async function searchItems(params: BrowseSearchParams): Promise<BrowseSearchResult> {
  const url = new URL(PATH, getEbayConfig().apiBase)
  url.searchParams.set('q', params.q)
  url.searchParams.set('limit', String(params.limit ?? 50))
  if (params.categoryId) url.searchParams.set('category_ids', params.categoryId)
  const filters: string[] = []
  if (params.excludeSellers?.length) filters.push(`excludeSellers:{${sellerList(params.excludeSellers)}}`)
  if (params.sellers?.length) filters.push(`sellers:{${sellerList(params.sellers)}}`)
  if (params.location && params.onlyShipsToLocation) filters.push(`deliveryCountry:${params.location.country}`)
  if (filters.length) url.searchParams.set('filter', filters.join(','))

  const data = await browseGet<RawSearchResponse>(PATH, url, params.location)
  return { total: data?.total ?? 0, items: (data?.itemSummaries ?? []).map(toItem) }
}

export interface ShippingQuote {
  service: string | null
  cost: string | null
  currency: string | null
  type: string | null
  minDate: string | null
  maxDate: string | null
}

export interface ItemShipping {
  price: string | null
  currency: string | null
  /** כל השירותים שהמודעה מציעה למיקום, הזול ראשון. ריק = לא שולח לשם */
  options: ShippingQuote[]
}

/** משלוח של מודעה (שלנו) למיקום קונה — מה ש-eBay מציג בלשונית Shipping לאותה מדינה */
export async function getItemShipping(legacyItemId: string, location: BuyerLocation): Promise<ItemShipping> {
  const url = new URL(ITEM_PATH, getEbayConfig().apiBase)
  url.searchParams.set('legacy_item_id', legacyItemId)
  const data = await browseGet<{ price?: Amount; shippingOptions?: RawShippingOption[] }>(ITEM_PATH, url, location)
  const options = (data.shippingOptions ?? [])
    .map((o) => ({
      service: o.shippingServiceCode ?? null,
      cost: o.shippingCost?.value ?? null,
      currency: o.shippingCost?.currency ?? null,
      type: o.shippingCostType ?? null,
      minDate: o.minEstimatedDeliveryDate ?? null,
      maxDate: o.maxEstimatedDeliveryDate ?? null,
    }))
    .sort((a, b) => (a.cost == null ? 1 : b.cost == null ? -1 : Number(a.cost) - Number(b.cost)))
  return { price: data.price?.value ?? null, currency: data.price?.currency ?? null, options }
}

/** כל המודעות הפעילות של מוכר ב-eBay (עובד גם למוכר בלי חנות eBay Store) */
export function sellerItemsUrl(username: string): string {
  return `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(username)}`
}
