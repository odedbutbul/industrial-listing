import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

async function loadSettings(supabase: ReturnType<typeof getClient>): Promise<Record<string, string>> {
  const { data } = await supabase.from('settings').select('key, value')
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  isArray: (name) => ['Item', 'PictureURL', 'Error', 'Errors', 'NameValueList'].includes(name),
  parseAttributeValue: true,
  parseTagValue: true,
})

function buildHeaders(appId: string, devId: string, certId: string, callName: string) {
  return {
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
    'X-EBAY-API-CALL-NAME': callName,
    'X-EBAY-API-APP-NAME': appId,
    'X-EBAY-API-DEV-NAME': devId,
    'X-EBAY-API-CERT-NAME': certId,
    'Content-Type': 'text/xml',
  }
}

function buildGetSellerListXml(userToken: string): string {
  const from = '2020-01-01T00:00:00.000Z'
  const to = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <DetailLevel>ReturnAll</DetailLevel>
  <StartTimeFrom>${from}</StartTimeFrom>
  <StartTimeTo>${to}</StartTimeTo>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetSellerListRequest>`
}

function buildGetItemXml(userToken: string, itemId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <DetailLevel>ReturnAll</DetailLevel>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetItemRequest>`
}

type NameValuePair = { Name: string; Value: string | string[] }

type EbayListItem = {
  ItemID: string | number
  Title: string
  SellingStatus?: {
    CurrentPrice?: { '#text'?: number } | number
    ListingStatus?: string
  }
  ListingDetails?: { ViewItemURL?: string; StartTime?: string }
}

type EbayItemDetail = {
  ItemID: string | number
  Title: string
  Quantity?: number
  QuantityAvailable?: number
  SellingStatus?: {
    CurrentPrice?: { '#text'?: number } | number
    ListingStatus?: string
  }
  ListingDetails?: { ViewItemURL?: string; StartTime?: string }
  PictureDetails?: { PictureURL?: string | string[] }
  Description?: string
  Location?: string
  ConditionDisplayName?: string
  PrimaryCategory?: { CategoryID?: string | number; CategoryName?: string }
  ItemSpecifics?: { NameValueList?: NameValuePair[] }
}

function extractSpecific(list: NameValuePair[] | undefined, ...names: string[]): string | null {
  if (!list) return null
  for (const name of names) {
    const found = list.find((nv) => nv.Name?.toLowerCase() === name.toLowerCase())
    if (found) {
      const val = Array.isArray(found.Value) ? found.Value[0] : found.Value
      if (val) return String(val)
    }
  }
  return null
}

function mapDetailedItem(item: EbayItemDetail) {
  const title = String(item.Title ?? '').trim()
  const specifics = item.ItemSpecifics?.NameValueList

  const priceRaw = item.SellingStatus?.CurrentPrice
  const price =
    typeof priceRaw === 'object' && priceRaw !== null
      ? (priceRaw['#text'] ?? null)
      : typeof priceRaw === 'number' ? priceRaw : null

  const picField = item.PictureDetails?.PictureURL
  const images: string[] = Array.isArray(picField)
    ? picField.filter(Boolean).map(String)
    : picField ? [String(picField)] : []

  const brand = extractSpecific(specifics, 'Brand', 'Manufacturer')
  const model = extractSpecific(specifics, 'Model', 'Part Number', 'Type')
  const mpn = extractSpecific(specifics, 'MPN', 'Manufacturer Part Number', 'Part Number')
  const countryOfOrigin = extractSpecific(
    specifics,
    'Country/Region of Manufacture',
    'Country of Manufacture',
    'Country of Origin',
    'Made In'
  )

  const categoryName = item.PrimaryCategory?.CategoryName ?? null
  const categoryId = item.PrimaryCategory?.CategoryID ? String(item.PrimaryCategory.CategoryID) : null
  const ebayCategory = categoryName ?? categoryId

  return {
    title,
    manufacturer: brand ?? '',
    model: model ?? '',
    brand: brand ?? null,
    mpn: mpn ?? null,
    country_of_origin: countryOfOrigin ?? null,
    ebay_category: ebayCategory ?? null,
    description: item.Description ?? null,
    price: price ? Number(price) : null,
    location: item.Location ?? null,
    condition: item.ConditionDisplayName ?? 'Good',
    quantity: item.QuantityAvailable ?? item.Quantity ?? 1,
    images,
    ebay_listing_id: String(item.ItemID),
    ebay_item_number: String(item.ItemID),
    ebay_url: item.ListingDetails?.ViewItemURL ?? null,
    ebay_published_at: item.ListingDetails?.StartTime ?? new Date().toISOString(),
    status_ebay: 'active' as const,
    status: 'active' as const,
    status_facebook: 'pending' as const,
  }
}

export async function POST() {
  const supabase = getClient()

  const settings = await loadSettings(supabase)
  const { EBAY_APP_ID, EBAY_CERT_ID, EBAY_DEV_ID, EBAY_USER_TOKEN, EBAY_SANDBOX } = settings

  if (!EBAY_APP_ID || !EBAY_USER_TOKEN) {
    return NextResponse.json(
      { error: 'פרטי eBay API חסרים — הגדר App ID ו-User Token בהגדרות' },
      { status: 400 }
    )
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const endpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll'

  const devId = EBAY_DEV_ID ?? ''
  const certId = EBAY_CERT_ID ?? ''

  // שלב 1 — GetSellerList לקבלת רשימת כל הפריטים
  let sellerXml: string
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(EBAY_APP_ID, devId, certId, 'GetSellerList'),
      body: buildGetSellerListXml(EBAY_USER_TOKEN),
      signal: AbortSignal.timeout(20000),
    })
    sellerXml = await res.text()
  } catch {
    return NextResponse.json({ error: 'לא ניתן להתחבר ל-eBay API' }, { status: 502 })
  }

  const sellerParsed = parser.parse(sellerXml)
  const sellerResponse = sellerParsed?.GetSellerListResponse

  if (!sellerResponse) {
    return NextResponse.json({ error: 'תגובה לא תקינה מ-eBay', raw: sellerXml.slice(0, 400) }, { status: 502 })
  }

  const ack = String(sellerResponse.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = sellerResponse.Errors ?? []
    const firstError = Array.isArray(errors) ? errors[0] : errors
    const msg = firstError?.LongMessage ?? firstError?.ShortMessage ?? `eBay Ack: ${ack}`
    return NextResponse.json({ error: msg }, { status: 200 })
  }

  const allItems: EbayListItem[] = sellerResponse?.ItemArray?.Item ?? []

  // סנן רק פריטים פעילים
  const activeItems = allItems.filter(
    (item) => !item.SellingStatus?.ListingStatus ||
      item.SellingStatus.ListingStatus === 'Active'
  )

  if (activeItems.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      message: isSandbox
        ? 'אין מוצרים פעילים בחשבון ה-Sandbox.'
        : 'אין מוצרים פעילים ב-eBay',
    })
  }

  // שלב 2 — בדוק אילו כבר קיימים
  const ebayNums = activeItems.map((i) => String(i.ItemID))
  const { data: existing } = await supabase
    .from('products')
    .select('ebay_item_number')
    .in('ebay_item_number', ebayNums)

  const existingNums = new Set((existing ?? []).map((p) => p.ebay_item_number))
  const newItems = activeItems.filter((item) => !existingNums.has(String(item.ItemID)))
  const skipped = activeItems.length - newItems.length

  if (newItems.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped,
      message: `כל ${skipped} המוצרים כבר קיימים במערכת`,
    })
  }

  // שלב 3 — GetItem לכל פריט חדש (כדי לקבל Item Specifics)
  const detailedItems: EbayItemDetail[] = []
  for (const item of newItems) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: buildHeaders(EBAY_APP_ID, devId, certId, 'GetItem'),
        body: buildGetItemXml(EBAY_USER_TOKEN, String(item.ItemID)),
        signal: AbortSignal.timeout(10000),
      })
      const xml = await res.text()
      const parsed = parser.parse(xml)
      const detail: EbayItemDetail = parsed?.GetItemResponse?.Item
      if (detail) detailedItems.push(detail)
    } catch {
      // אם GetItem נכשל — דלג על הפריט הזה
    }
  }

  if (detailedItems.length === 0) {
    return NextResponse.json({ error: 'לא ניתן לטעון פרטי מוצרים מ-eBay' }, { status: 502 })
  }

  const products = detailedItems.map(mapDetailedItem)
  const { error: insertError } = await supabase.from('products').insert(products)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    imported: detailedItems.length,
    skipped,
    message: `יובאו ${detailedItems.length} מוצרים בהצלחה${skipped > 0 ? ` (${skipped} כבר קיימים)` : ''}`,
  })
}
