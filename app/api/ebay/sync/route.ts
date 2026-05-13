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

function buildGetSellerListXml(userToken: string): string {
  const now = new Date()
  const from = '2020-01-01T00:00:00.000Z'
  const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <DetailLevel>ReturnAll</DetailLevel>
  <GranularityLevel>Fine</GranularityLevel>
  <StartTimeFrom>${from}</StartTimeFrom>
  <StartTimeTo>${to}</StartTimeTo>
  <ActiveList>true</ActiveList>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>1</PageNumber>
  </Pagination>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetSellerListRequest>`
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  isArray: (name) => ['Item', 'PictureURL', 'Error', 'Errors', 'NameValueList'].includes(name),
  parseAttributeValue: true,
  parseTagValue: true,
})

type NameValuePair = { Name: string; Value: string | string[] }

type EbayItem = {
  ItemID: string | number
  Title: string
  Quantity?: number
  QuantityAvailable?: number
  SellingStatus?: { CurrentPrice?: { '#text'?: number; _currencyID?: string } | number }
  ListingDetails?: { ViewItemURL?: string; StartTime?: string }
  PictureDetails?: { PictureURL?: string | string[] }
  Description?: string
  Location?: string
  ConditionDisplayName?: string
  PrimaryCategory?: { CategoryID?: string | number; CategoryName?: string }
  ItemSpecifics?: { NameValueList?: NameValuePair[] }
}

function extractSpecific(list: NameValuePair[] | undefined, name: string): string | null {
  if (!list) return null
  const found = list.find((nv) => nv.Name?.toLowerCase() === name.toLowerCase())
  if (!found) return null
  return Array.isArray(found.Value) ? found.Value[0] ?? null : String(found.Value ?? '')
}

function mapEbayItem(item: EbayItem) {
  const title = String(item.Title ?? '').trim()
  const specifics = item.ItemSpecifics?.NameValueList

  // מחיר — שמור USD כפי שמגיע מ-eBay
  const priceRaw = item.SellingStatus?.CurrentPrice
  const price =
    typeof priceRaw === 'object' && priceRaw !== null
      ? (priceRaw['#text'] ?? null)
      : typeof priceRaw === 'number'
      ? priceRaw
      : null

  // תמונות — URLs של eBay ישירות
  const picField = item.PictureDetails?.PictureURL
  const images: string[] = Array.isArray(picField)
    ? picField.filter(Boolean)
    : picField
    ? [String(picField)]
    : []

  // Item Specifics
  const brand = extractSpecific(specifics, 'Brand') ?? extractSpecific(specifics, 'Manufacturer')
  const model = extractSpecific(specifics, 'Model') ?? extractSpecific(specifics, 'Part Number')
  const mpn = extractSpecific(specifics, 'MPN') ?? extractSpecific(specifics, 'Manufacturer Part Number')
  const countryOfOrigin = extractSpecific(specifics, 'Country/Region of Manufacture') ??
    extractSpecific(specifics, 'Country of Manufacture') ??
    extractSpecific(specifics, 'Country of Origin')

  // קטגוריה
  const categoryId = item.PrimaryCategory?.CategoryID
    ? String(item.PrimaryCategory.CategoryID)
    : null
  const categoryName = item.PrimaryCategory?.CategoryName ?? null
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

  let xmlText: string
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetSellerList',
        'X-EBAY-API-APP-NAME': EBAY_APP_ID,
        'X-EBAY-API-DEV-NAME': EBAY_DEV_ID ?? '',
        'X-EBAY-API-CERT-NAME': EBAY_CERT_ID ?? '',
        'Content-Type': 'text/xml',
      },
      body: buildGetSellerListXml(EBAY_USER_TOKEN),
      signal: AbortSignal.timeout(20000),
    })
    xmlText = await res.text()
  } catch {
    return NextResponse.json({ error: 'לא ניתן להתחבר ל-eBay API — בדוק חיבור אינטרנט' }, { status: 502 })
  }

  const parsed = parser.parse(xmlText)
  const response = parsed?.GetSellerListResponse

  if (!response) {
    return NextResponse.json({ error: 'תגובה לא תקינה מ-eBay', raw: xmlText.slice(0, 500) }, { status: 502 })
  }

  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = response.Errors ?? []
    const firstError = Array.isArray(errors) ? errors[0] : errors
    const msg = firstError?.LongMessage ?? firstError?.ShortMessage ?? `eBay Ack: ${ack}`
    return NextResponse.json({ error: msg }, { status: 200 })
  }

  const items: EbayItem[] = response?.ItemArray?.Item ?? []

  if (items.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      message: isSandbox
        ? 'אין מוצרים פעילים בחשבון ה-Sandbox. צור listing ב-eBay Sandbox תחילה.'
        : 'אין מוצרים פעילים ב-eBay',
    })
  }

  // debug — שדות הפריט הראשון (מוסר לאחר בדיקה)
  const debugFirstItem = {
    ItemID: items[0]?.ItemID,
    Title: items[0]?.Title,
    ConditionDisplayName: items[0]?.ConditionDisplayName,
    PrimaryCategory: items[0]?.PrimaryCategory,
    ItemSpecifics: items[0]?.ItemSpecifics,
    QuantityAvailable: items[0]?.QuantityAvailable,
    Quantity: items[0]?.Quantity,
    hasPictures: (items[0]?.PictureDetails?.PictureURL as string[] | string | undefined)
      ? true : false,
    hasDescription: !!items[0]?.Description,
  }

  // בדוק אילו כבר קיימים לפי ebay_item_number
  const ebayNums = items.map((i) => String(i.ItemID))
  const { data: existing } = await supabase
    .from('products')
    .select('ebay_item_number')
    .in('ebay_item_number', ebayNums)

  const existingNums = new Set((existing ?? []).map((p) => p.ebay_item_number))
  const newItems = items.filter((item) => !existingNums.has(String(item.ItemID)))
  const skipped = items.length - newItems.length

  if (newItems.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped,
      message: `כל ${skipped} המוצרים כבר קיימים במערכת`,
      _debug: debugFirstItem,
    })
  }

  const products = newItems.map(mapEbayItem)
  const { error: insertError } = await supabase.from('products').insert(products)

  if (insertError) {
    return NextResponse.json({ error: insertError.message, _debug: debugFirstItem }, { status: 500 })
  }

  return NextResponse.json({
    imported: newItems.length,
    skipped,
    message: `יובאו ${newItems.length} מוצרים בהצלחה${skipped > 0 ? ` (${skipped} כבר קיימים)` : ''}`,
    _debug: debugFirstItem,
  })
}
