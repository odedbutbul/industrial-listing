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

function buildGetMyeBaySellingXml(userToken: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${userToken}</eBayAuthToken>
  </RequesterCredentials>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetMyeBaySellingRequest>`
}

// פרסר מוגדר לזהות שדות שתמיד צריכים להיות מערך
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '_',
  isArray: (name) => ['Item', 'PictureURL', 'Error', 'Errors'].includes(name),
  parseAttributeValue: true,
  parseTagValue: true,
})

type EbayItem = {
  ItemID: string | number
  Title: string
  Quantity?: number
  SellingStatus?: { CurrentPrice?: { '#text'?: number } | number }
  ListingDetails?: { ViewItemURL?: string; StartTime?: string }
  PictureDetails?: { PictureURL?: string | string[] }
  Description?: string
  Location?: string
  ConditionDisplayName?: string
}

function mapEbayItem(item: EbayItem) {
  const title = String(item.Title ?? '').trim()

  const priceRaw = item.SellingStatus?.CurrentPrice
  const price =
    typeof priceRaw === 'object' && priceRaw !== null
      ? (priceRaw['#text'] ?? null)
      : typeof priceRaw === 'number'
      ? priceRaw
      : null

  const picField = item.PictureDetails?.PictureURL
  const images: string[] = Array.isArray(picField)
    ? picField.filter(Boolean)
    : picField
    ? [picField]
    : []

  return {
    title,
    manufacturer: '',
    model: '',
    description: item.Description ?? null,
    price: price ? Number(price) : null,
    location: item.Location ?? null,
    condition: item.ConditionDisplayName ?? 'Good',
    quantity: item.Quantity ?? 1,
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

  // טען הגדרות מסופאבייס
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

  // קריאה ל-eBay Trading API
  let xmlText: string
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-APP-NAME': EBAY_APP_ID,
        'X-EBAY-API-DEV-NAME': EBAY_DEV_ID ?? '',
        'X-EBAY-API-CERT-NAME': EBAY_CERT_ID ?? '',
        'Content-Type': 'text/xml',
      },
      body: buildGetMyeBaySellingXml(EBAY_USER_TOKEN),
      signal: AbortSignal.timeout(15000),
    })
    xmlText = await res.text()
  } catch {
    return NextResponse.json({ error: 'לא ניתן להתחבר ל-eBay API — בדוק חיבור אינטרנט' }, { status: 502 })
  }

  // פרסור XML
  const parsed = parser.parse(xmlText)
  const response = parsed?.GetMyeBaySellingResponse

  if (!response) {
    return NextResponse.json({ error: 'תגובה לא תקינה מ-eBay', raw: xmlText.slice(0, 300) }, { status: 502 })
  }

  // בדוק שגיאות מ-eBay
  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = response.Errors ?? []
    const firstError = Array.isArray(errors) ? errors[0] : errors
    const msg = firstError?.LongMessage ?? firstError?.ShortMessage ?? `eBay Ack: ${ack}`
    return NextResponse.json({ error: msg }, { status: 200 })
  }

  // חלץ מוצרים
  const items: EbayItem[] = response?.ActiveList?.ItemArray?.Item ?? []

  if (items.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: 0,
      message: isSandbox
        ? 'אין מוצרים פעילים בחשבון ה-Sandbox. צור listing ב-eBay Sandbox תחילה.'
        : 'אין מוצרים פעילים ב-eBay',
    })
  }

  // upsert לפי ebay_listing_id (מעדכן קיימים, מוסיף חדשים)
  const products = items.map(mapEbayItem)
  const { error: upsertError } = await supabase
    .from('products')
    .upsert(products, { onConflict: 'ebay_listing_id' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({
    imported: items.length,
    skipped: 0,
    message: `סונכרנו ${items.length} מוצרים מ-eBay בהצלחה`,
  })
}
