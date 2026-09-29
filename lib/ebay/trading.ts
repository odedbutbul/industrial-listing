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
  isArray: (name) => ['Item', 'PictureURL', 'NameValueList', 'Errors', 'Variation'].includes(name),
})

export class EbayApiError extends Error {
  constructor(message: string, readonly callName: string, readonly errors: unknown[] = []) {
    super(message)
  }
}

type XmlNode = Record<string, unknown>

async function tradingCall(callName: string, innerXml: string): Promise<XmlNode> {
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
  quantityAvailable: number | null
  price: string | null
  currency: string | null
  hasVariations: boolean
  startTime: string | null
}

export interface ActiveListingsPage {
  items: ActiveListingSummary[]
  totalPages: number
  totalEntries: number
}

export async function getActiveListingsPage(page: number, perPage = 200): Promise<ActiveListingsPage> {
  const r = await tradingCall(
    'GetMyeBaySelling',
    `  <ActiveList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>${perPage}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>
  </ActiveList>
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
      return {
        itemId: String(i.ItemID),
        title: String(i.Title ?? ''),
        sku: str(i.SKU),
        quantityAvailable: int(i.QuantityAvailable),
        price: amount,
        currency,
        hasVariations: !!i.Variations,
        startTime: str((i.ListingDetails as XmlNode | undefined)?.StartTime),
      }
    }),
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
  }
}
