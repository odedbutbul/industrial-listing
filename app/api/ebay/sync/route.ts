import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import { v2 as cloudinary } from 'cloudinary'

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

function buildGetMyeBaySellingXml(userToken: string, page: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetMyeBaySellingRequest>`
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
}

type EbayItemDetail = {
  ItemID: string | number
  Title: string
  Quantity?: number
  QuantityAvailable?: number
  SellingStatus?: { CurrentPrice?: { '#text'?: number } | number }
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
    const found = list.find((nv) => String(nv.Name ?? '').toLowerCase() === name.toLowerCase())
    if (found) {
      const val = Array.isArray(found.Value) ? found.Value[0] : found.Value
      if (val) return String(val)
    }
  }
  return null
}

async function uploadImageToCloudinary(url: string, folder: string): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(url, {
      folder,
      resource_type: 'image',
      fetch_format: 'auto',
      quality: 'auto',
      timeout: 30000,
    })
    return result.secure_url
  } catch {
    return url
  }
}

function mapDetailedItem(item: EbayItemDetail, images: string[]) {
  const title = String(item.Title ?? '').trim()
  const specifics = item.ItemSpecifics?.NameValueList

  const priceRaw = item.SellingStatus?.CurrentPrice
  const price =
    typeof priceRaw === 'object' && priceRaw !== null
      ? (priceRaw['#text'] ?? null)
      : typeof priceRaw === 'number' ? priceRaw : null

  const brand = extractSpecific(specifics, 'Brand', 'Manufacturer')
  const model = extractSpecific(specifics, 'Model', 'Type', 'Series')
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

  return {
    title,
    manufacturer: brand ?? '',
    model: model ?? '',
    brand: brand ?? null,
    mpn: mpn ?? null,
    country_of_origin: countryOfOrigin ?? null,
    ebay_category: categoryName ?? categoryId ?? null,
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

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || settings.CLOUDINARY_CLOUD_NAME
  const cloudKey = process.env.CLOUDINARY_API_KEY || settings.CLOUDINARY_API_KEY
  const cloudSecret = process.env.CLOUDINARY_API_SECRET || settings.CLOUDINARY_API_SECRET
  const useCloudinary = !!(cloudName && cloudKey && cloudSecret)
  if (useCloudinary) {
    cloudinary.config({ cloud_name: cloudName, api_key: cloudKey, api_secret: cloudSecret })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const endpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll'
  const headers = buildHeaders(EBAY_APP_ID, EBAY_DEV_ID ?? '', EBAY_CERT_ID ?? '', 'GetMyeBaySelling')

  // שלב 1 — GetMyeBaySelling עם pagination מלא
  const allItems: EbayListItem[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    let xml: string
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: buildGetMyeBaySellingXml(EBAY_USER_TOKEN, page),
        signal: AbortSignal.timeout(20000),
      })
      xml = await res.text()
    } catch {
      return NextResponse.json({ error: 'לא ניתן להתחבר ל-eBay API' }, { status: 502 })
    }

    const parsed = parser.parse(xml)
    const response = parsed?.GetMyeBaySellingResponse

    if (!response) {
      return NextResponse.json({ error: 'תגובה לא תקינה מ-eBay', raw: xml.slice(0, 400) }, { status: 502 })
    }

    if (page === 1) {
      const ack = String(response.Ack ?? '')
      if (ack !== 'Success' && ack !== 'Warning') {
        const errors = response.Errors ?? []
        const firstError = Array.isArray(errors) ? errors[0] : errors
        const msg = firstError?.LongMessage ?? firstError?.ShortMessage ?? `eBay Ack: ${ack}`
        return NextResponse.json({ error: msg }, { status: 200 })
      }
      totalPages = Number(response?.ActiveList?.PaginationResult?.TotalNumberOfPages ?? 1)
    }

    const pageItems: EbayListItem[] = response?.ActiveList?.ItemArray?.Item ?? []
    allItems.push(...pageItems)
    page++
  }

  if (allItems.length === 0) {
    return NextResponse.json({
      imported: 0, updated: 0, total: 0,
      message: isSandbox
        ? 'אין מוצרים פעילים בחשבון ה-Sandbox.'
        : 'אין מוצרים פעילים ב-eBay',
    })
  }

  // שלב 2 — בדוק מה קיים במסד הנתונים
  const ebayNums = allItems.map((i) => String(i.ItemID))
  const { data: existing } = await supabase
    .from('products')
    .select('id, ebay_item_number')
    .in('ebay_item_number', ebayNums)

  const existingMap = new Map((existing ?? []).map((p) => [p.ebay_item_number, p.id]))
  const toInsertIds = allItems.filter((i) => !existingMap.has(String(i.ItemID))).map((i) => String(i.ItemID))
  const toUpdateIds = allItems.filter((i) => existingMap.has(String(i.ItemID))).map((i) => String(i.ItemID))

  // שלב 3 — GetItem במקביל לכל הפריטים
  const allIds = [...toInsertIds, ...toUpdateIds]
  const getItemHeaders = buildHeaders(EBAY_APP_ID, EBAY_DEV_ID ?? '', EBAY_CERT_ID ?? '', 'GetItem')

  const detailResults = await Promise.allSettled(
    allIds.map(async (itemId) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getItemHeaders,
        body: buildGetItemXml(EBAY_USER_TOKEN, itemId),
        signal: AbortSignal.timeout(15000),
      })
      const xml = await res.text()
      const parsed = parser.parse(xml)
      return parsed?.GetItemResponse?.Item as EbayItemDetail | null
    })
  )

  const detailedItems: EbayItemDetail[] = detailResults
    .filter((r): r is PromiseFulfilledResult<EbayItemDetail> => r.status === 'fulfilled' && !!r.value)
    .map((r) => r.value)

  // שלב 4 — העלאת תמונות ל-Cloudinary (או ישירות)
  const folder = 'industrial-listing/ebay'
  const mappedProducts = await Promise.all(
    detailedItems.map(async (item) => {
      const picField = item.PictureDetails?.PictureURL
      const ebayUrls: string[] = Array.isArray(picField)
        ? picField.filter(Boolean).map(String)
        : picField ? [String(picField)] : []

      const images = useCloudinary && ebayUrls.length > 0
        ? await Promise.all(ebayUrls.map((url) => uploadImageToCloudinary(url, folder)))
        : ebayUrls

      return mapDetailedItem(item, images)
    })
  )

  // שלב 5 — INSERT חדשים / UPDATE קיימים (בנפרד, בלי upsert)
  const toInsert = mappedProducts.filter((p) => toInsertIds.includes(p.ebay_item_number))
  const toUpdate = mappedProducts.filter((p) => toUpdateIds.includes(p.ebay_item_number))

  let inserted = 0
  let updated = 0

  if (toInsert.length > 0) {
    const { error } = await supabase.from('products').insert(toInsert)
    if (error) return NextResponse.json({ error: `שגיאת INSERT: ${error.message}` }, { status: 500 })
    inserted = toInsert.length
  }

  if (toUpdate.length > 0) {
    const updateResults = await Promise.allSettled(
      toUpdate.map((p) => {
        const id = existingMap.get(p.ebay_item_number)
        return supabase.from('products').update(p).eq('id', id)
      })
    )
    updated = updateResults.filter((r) => r.status === 'fulfilled').length
  }

  const total = inserted + updated
  const parts = []
  if (inserted > 0) parts.push(`${inserted} חדשים`)
  if (updated > 0) parts.push(`${updated} עודכנו`)

  return NextResponse.json({
    imported: inserted,
    updated,
    total,
    cloudinary: useCloudinary,
    message: total > 0
      ? `סונכרנו ${total} מוצרים (${parts.join(', ')})${useCloudinary ? ' — תמונות ב-Cloudinary' : ''}`
      : 'לא היו שינויים',
  })
}
