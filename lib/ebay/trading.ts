import { XMLParser } from 'fast-xml-parser'
import { getValidAccessToken } from './auth'
import { getEbayConfig } from './config'
import { assertEbayCallAllowed } from './guard'

// לקוח Trading API (XML). כל קריאה עוברת את assertEbayCallAllowed.

const COMPAT_LEVEL = '1271'
const SITE_ID = '0' // eBay US

// parseTagValue=false: SKU כמו "00123" חייב להישאר מחרוזת. מספרים מומרים ידנית.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) =>
    ['Item', 'PictureURL', 'NameValueList', 'Value', 'Errors', 'Variation', 'ShippingServiceOptions', 'InternationalShippingServiceOption', 'ShipToLocation', 'ExcludeShipToLocation'].includes(name),
})

export class EbayApiError extends Error {
  constructor(message: string, readonly callName: string, readonly errors: unknown[] = []) {
    super(message)
  }
}

type XmlNode = Record<string, unknown>

export async function tradingCall(callName: string, innerXml: string): Promise<XmlNode> {
  assertEbayCallAllowed(callName)
  const config = getEbayConfig()
  const token = await getValidAccessToken()

  const body = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>${COMPAT_LEVEL}</Version>
${innerXml}
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</${callName}Request>`

  const res = await fetch(config.tradingEndpoint, {
    method: 'POST',
    headers: {
      'X-EBAY-API-IAF-TOKEN': token,
      'X-EBAY-API-SITEID': SITE_ID,
      'X-EBAY-API-COMPATIBILITY-LEVEL': COMPAT_LEVEL,
      'X-EBAY-API-CALL-NAME': callName,
      'Content-Type': 'text/xml',
    },
    body,
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  const response = parser.parse(text)?.[`${callName}Response`] as XmlNode | undefined
  if (!response) throw new EbayApiError(`תגובה לא תקינה מ-eBay (HTTP ${res.status})`, callName)

  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = (response.Errors as XmlNode[] | undefined) ?? []
    const first = errors[0] ?? {}
    const msg = String(first.LongMessage ?? first.ShortMessage ?? `eBay Ack: ${ack}`)
    throw new EbayApiError(msg, callName, errors)
  }
  return response
}

// ── עזרי המרה ────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v))
const int = (v: unknown): number | null => {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : null
}
/** ערך כספי: <CurrentPrice currencyID="USD">12.5</CurrentPrice> */
function money(v: unknown): { amount: string | null; currency: string | null } {
  if (v && typeof v === 'object') {
    const o = v as XmlNode
    return { amount: str(o['#text']), currency: str(o['@_currencyID']) }
  }
  return { amount: str(v), currency: null }
}

// ── GetMyeBaySelling ─────────────────────────────────────────────────────────

export interface ActiveListingSummary {
  itemId: string
  title: string
  sku: string | null
  /** כמות שנותרה למכירה (ב-ActiveList eBay כבר מחשב Quantity − QuantitySold) */
  quantityAvailable: number | null
  totalQty: number | null
  price: string | null
  currency: string | null
  galleryUrl: string | null
  viewItemUrl: string | null
  hasVariations: boolean
  startTime: string | null
}

export interface ActiveListingsPage {
  items: ActiveListingSummary[]
  totalPages: number
  totalEntries: number
}

export async function getActiveListingsPage(page: number, perPage = 200): Promise<ActiveListingsPage> {
  // רק ActiveList. בלי ההחרגות eBay מחזיר גם SoldList/UnsoldList באותה תשובה.
  const r = await tradingCall(
    'GetMyeBaySelling',
    `  <ActiveList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>${perPage}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>
  </ActiveList>
  <SoldList><Include>false</Include></SoldList>
  <UnsoldList><Include>false</Include></UnsoldList>
  <ScheduledList><Include>false</Include></ScheduledList>
  <DeletedFromSoldList><Include>false</Include></DeletedFromSoldList>
  <DeletedFromUnsoldList><Include>false</Include></DeletedFromUnsoldList>
  <DetailLevel>ReturnAll</DetailLevel>`,
  )
  const active = (r.ActiveList ?? {}) as XmlNode
  const pagination = (active.PaginationResult ?? {}) as XmlNode
  const rawItems = (((active.ItemArray ?? {}) as XmlNode).Item as XmlNode[] | undefined) ?? []

  return {
    totalPages: int(pagination.TotalNumberOfPages) ?? 1,
    totalEntries: int(pagination.TotalNumberOfEntries) ?? rawItems.length,
    items: rawItems.map((i) => {
      const selling = (i.SellingStatus ?? {}) as XmlNode
      const { amount, currency } = money(selling.CurrentPrice ?? i.BuyItNowPrice)
      const details = (i.ListingDetails ?? {}) as XmlNode
      const pics = (i.PictureDetails ?? {}) as XmlNode
      return {
        itemId: String(i.ItemID),
        title: String(i.Title ?? ''),
        sku: str(i.SKU),
        quantityAvailable: int(i.QuantityAvailable),
        totalQty: int(i.Quantity),
        price: amount,
        currency,
        galleryUrl: str(pics.GalleryURL),
        viewItemUrl: str(details.ViewItemURL),
        hasVariations: !!i.Variations,
        startTime: str(details.StartTime),
      }
    }),
  }
}

// ── מחירי משלוח (ShippingDetails) ─────────────────────────────────────────────

export interface ShippingOption {
  service: string | null
  /** מחיר לפריט הראשון. null = מחושב אצל eBay לפי מיקום הקונה (Calculated) */
  cost: string | null
  /** מחיר לכל פריט נוסף באותה הזמנה */
  additionalCost: string | null
  free: boolean
  /** בינלאומי בלבד: לאן השירות שולח (Worldwide, Europe, CA...) */
  shipTo: string[]
}

export interface ShippingCosts {
  /** Flat · Calculated · FlatDomesticCalculatedInternational · CalculatedDomesticFlatInternational · Freight · NotSpecified */
  type: string | null
  currency: string | null
  /** השירות הראשון לארה"ב (עדיפות 1) */
  us: ShippingOption | null
  /** השירות הבינלאומי הראשון — "שאר העולם" */
  intl: ShippingOption | null
  domestic: ShippingOption[]
  international: ShippingOption[]
  /** eBay International Shipping / Global Shipping Program — eBay מחשב את המחיר לחו"ל */
  globalShipping: boolean
  excludeLocations: string[]
  /** שם מדיניות המשלוח (Business Policy), אם יש */
  policyName: string | null
}

function shippingOption(o: XmlNode, international: boolean): { priority: number; option: ShippingOption; currency: string | null } {
  const cost = money(o.ShippingServiceCost)
  const additional = money(o.ShippingServiceAdditionalCost)
  const free = String(o.FreeShipping ?? '') === 'true' || (cost.amount !== null && Number(cost.amount) === 0)
  return {
    priority: int(o.ShippingServicePriority) ?? 99,
    currency: cost.currency ?? additional.currency,
    option: {
      service: str(o.ShippingService),
      cost: cost.amount,
      additionalCost: additional.amount,
      free,
      shipTo: international ? ((o.ShipToLocation as unknown[] | undefined) ?? []).map(String).filter(Boolean) : [],
    },
  }
}

/** ShippingDetails של מודעה → מחיר לארה"ב ומחיר לשאר העולם. null = אין פרטי משלוח בתשובה. */
export function parseShippingCosts(item: XmlNode): ShippingCosts | null {
  const d = item.ShippingDetails as XmlNode | undefined
  if (!d) return null
  const dom = ((d.ShippingServiceOptions as XmlNode[] | undefined) ?? []).map((o) => shippingOption(o, false)).sort((a, b) => a.priority - b.priority)
  const intl = ((d.InternationalShippingServiceOption as XmlNode[] | undefined) ?? []).map((o) => shippingOption(o, true)).sort((a, b) => a.priority - b.priority)
  const profile = ((item.SellerProfiles as XmlNode | undefined)?.SellerShippingProfile ?? {}) as XmlNode
  return {
    type: str(d.ShippingType),
    currency: [...dom, ...intl].find((o) => o.currency)?.currency ?? null,
    us: dom[0]?.option ?? null,
    intl: intl[0]?.option ?? null,
    domestic: dom.map((o) => o.option),
    international: intl.map((o) => o.option),
    globalShipping: String(d.GlobalShipping ?? '') === 'true',
    excludeLocations: ((d.ExcludeShipToLocation as unknown[] | undefined) ?? []).map(String).filter(Boolean),
    policyName: str(profile.ShippingProfileName),
  }
}

// ── GetSellerList: מחירי משלוח לכל המודעות הפעילות ─────────────────────────────

export interface SellerListShippingPage {
  items: { itemId: string; sku: string | null; shippingCosts: ShippingCosts | null }[]
  totalPages: number
  totalEntries: number
}

/**
 * מודעות שמסתיימות מעכשיו ועד 119 יום (eBay מגביל ל-120) — זה כל המודעות הפעילות:
 * מודעת GTC מתחדשת כל 30 יום, אז מועד הסיום שלה תמיד בחלון.
 * OutputSelector מצמצם את התשובה ל-ItemID, SKU ופרטי המשלוח (בלי תיאורים).
 */
export async function getSellerListShippingPage(page: number, perPage = 200, now = new Date()): Promise<SellerListShippingPage> {
  const to = new Date(now.getTime() + 119 * 86400_000)
  const r = await tradingCall(
    'GetSellerList',
    `  <EndTimeFrom>${now.toISOString()}</EndTimeFrom>
  <EndTimeTo>${to.toISOString()}</EndTimeTo>
  <DetailLevel>ReturnAll</DetailLevel>
  <Pagination><EntriesPerPage>${perPage}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>
  <OutputSelector>ItemArray.Item.ItemID</OutputSelector>
  <OutputSelector>ItemArray.Item.SKU</OutputSelector>
  <OutputSelector>ItemArray.Item.ShippingDetails</OutputSelector>
  <OutputSelector>ItemArray.Item.SellerProfiles</OutputSelector>
  <OutputSelector>PaginationResult</OutputSelector>`,
  )
  const pagination = (r.PaginationResult ?? {}) as XmlNode
  const rawItems = (((r.ItemArray ?? {}) as XmlNode).Item as XmlNode[] | undefined) ?? []
  return {
    totalPages: int(pagination.TotalNumberOfPages) ?? 1,
    totalEntries: int(pagination.TotalNumberOfEntries) ?? rawItems.length,
    items: rawItems.map((i) => ({ itemId: String(i.ItemID), sku: str(i.SKU), shippingCosts: parseShippingCosts(i) })),
  }
}

// ── GetItem ──────────────────────────────────────────────────────────────────

export interface EbayItemDetail {
  itemId: string
  title: string
  sku: string | null
  description: string | null
  condition: string | null
  /** כמות שנותרה למכירה = Quantity − QuantitySold */
  availableQty: number
  totalQty: number | null
  quantitySold: number | null
  price: string | null
  currency: string | null
  images: string[]
  brand: string | null
  mpn: string | null
  categoryId: string | null
  categoryName: string | null
  listingStatus: string | null
  viewItemUrl: string | null
  hasVariations: boolean
  subtitle: string | null
  conditionId: string | null
  conditionDescription: string | null
  /** כל ה-Item Specifics: שם → ערכים */
  itemSpecifics: Record<string, string[]>
  /** משקל ומידות אריזה (ShippingPackageDetails) */
  shipping: {
    weightMajor: number | null
    weightMinor: number | null
    weightUnit: string | null
    length: number | null
    width: number | null
    depth: number | null
    dimensionUnit: string | null
    packageType: string | null
  } | null
  /** מחירי משלוח לארה"ב ולשאר העולם (ShippingDetails) */
  shippingCosts: ShippingCosts | null
  location: string | null
  country: string | null
  listingStartedAt: string | null
}

/** ערך עם יחידה: <WeightMajor unit="lbs">2</WeightMajor> */
function measure(v: unknown): { value: number | null; unit: string | null } {
  if (v && typeof v === 'object') {
    const o = v as XmlNode
    const n = Number(o['#text'])
    return { value: Number.isFinite(n) ? n : null, unit: str(o['@_unit'] ?? o['@_measurementSystem']) }
  }
  const n = Number(v)
  return { value: v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n, unit: null }
}

function specific(list: XmlNode[] | undefined, ...names: string[]): string | null {
  if (!list) return null
  for (const name of names) {
    const found = list.find((nv) => String(nv.Name ?? '').toLowerCase() === name.toLowerCase())
    if (found) {
      const v = Array.isArray(found.Value) ? found.Value[0] : found.Value
      if (v) return String(v)
    }
  }
  return null
}

export async function getItem(itemId: string): Promise<EbayItemDetail> {
  if (!/^\d+$/.test(itemId)) throw new Error(`ItemID לא תקין: ${itemId}`)
  const r = await tradingCall(
    'GetItem',
    `  <ItemID>${itemId}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <DetailLevel>ReturnAll</DetailLevel>`,
  )
  const items = r.Item as XmlNode[] | undefined
  const item = items?.[0]
  if (!item) throw new EbayApiError(`GetItem החזיר תגובה ללא Item (${itemId})`, 'GetItem')

  const selling = (item.SellingStatus ?? {}) as XmlNode
  const totalQty = int(item.Quantity)
  const quantitySold = int(selling.QuantitySold)
  const availableQty = Math.max(0, (totalQty ?? 1) - (quantitySold ?? 0))
  const { amount, currency } = money(selling.CurrentPrice ?? item.StartPrice)
  const pics = ((item.PictureDetails as XmlNode | undefined)?.PictureURL as unknown[] | undefined) ?? []
  const specifics = ((item.ItemSpecifics as XmlNode | undefined)?.NameValueList as XmlNode[] | undefined) ?? undefined
  const category = (item.PrimaryCategory ?? {}) as XmlNode

  return {
    itemId: String(item.ItemID),
    title: String(item.Title ?? '').trim(),
    sku: str(item.SKU),
    description: str(item.Description),
    condition: str(item.ConditionDisplayName),
    availableQty,
    totalQty,
    quantitySold,
    price: amount,
    currency: currency ?? str(item.Currency),
    images: pics.map(String).filter(Boolean),
    brand: specific(specifics, 'Brand', 'Manufacturer'),
    mpn: specific(specifics, 'MPN', 'Manufacturer Part Number', 'Part Number'),
    categoryId: str(category.CategoryID),
    categoryName: str(category.CategoryName),
    listingStatus: str(selling.ListingStatus),
    viewItemUrl: str((item.ListingDetails as XmlNode | undefined)?.ViewItemURL),
    hasVariations: !!item.Variations,
    subtitle: str(item.SubTitle),
    conditionId: str(item.ConditionID),
    conditionDescription: str(item.ConditionDescription),
    itemSpecifics: Object.fromEntries(
      (specifics ?? [])
        .map((nv) => [String(nv.Name ?? '').trim(), (Array.isArray(nv.Value) ? nv.Value : [nv.Value]).map((v) => String(v ?? '').trim()).filter(Boolean)] as const)
        .filter(([name, values]) => name && values.length),
    ),
    shipping: (() => {
      const pkg = item.ShippingPackageDetails as XmlNode | undefined
      if (!pkg) return null
      const major = measure(pkg.WeightMajor)
      const minor = measure(pkg.WeightMinor)
      const len = measure(pkg.PackageLength)
      const wid = measure(pkg.PackageWidth)
      const dep = measure(pkg.PackageDepth)
      return {
        weightMajor: major.value,
        weightMinor: minor.value,
        weightUnit: major.unit ?? minor.unit,
        length: len.value,
        width: wid.value,
        depth: dep.value,
        dimensionUnit: len.unit ?? wid.unit ?? dep.unit,
        packageType: str(pkg.ShippingPackage),
      }
    })(),
    shippingCosts: parseShippingCosts(item),
    location: str(item.Location),
    country: str(item.Country),
    listingStartedAt: str((item.ListingDetails as XmlNode | undefined)?.StartTime),
  }
}
