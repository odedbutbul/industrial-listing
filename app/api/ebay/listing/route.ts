import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
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

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true })

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CONDITION_ID: Record<string, string> = {
  'New': '1000',
  'Like New': '3000',
  'Very Good': '4000',
  'Good': '5000',
  'Acceptable': '6000',
  'For parts or not working': '7000',
}

const INTL_SERVICE: Record<string, string> = {
  'Standard International Shipping': 'StandardInternational',
  'Expedited International Shipping': 'ExpeditedInternational',
  'Economy International Shipping': 'EconomyInternational',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddItemXml(token: string, p: any): string {
  const title = escapeXml((p.title || `${p.manufacturer} ${p.model}`).slice(0, 80))
  const conditionId = CONDITION_ID[p.condition] ?? '5000'
  const price = p.price ?? 0
  const qty = p.quantity ?? 1
  const categoryId = p.ebay_category || '58277'
  const location = escapeXml(p.location || 'Israel')
  const desc = (p.description || String(title)).replace(/]]>/g, ']] >')

  const pictureXml = ((p.images ?? []) as string[]).slice(0, 12)
    .map((u) => `      <PictureURL>${u}</PictureURL>`).join('\n')

  const specificsXml = [
    p.brand             ? `      <NameValueList><Name>Brand</Name><Value>${escapeXml(p.brand)}</Value></NameValueList>` : '',
    p.mpn               ? `      <NameValueList><Name>MPN</Name><Value>${escapeXml(p.mpn)}</Value></NameValueList>` : '',
    p.country_of_origin ? `      <NameValueList><Name>Country/Region of Manufacture</Name><Value>${escapeXml(p.country_of_origin)}</Value></NameValueList>` : '',
  ].filter(Boolean).join('\n')

  const intl = p.shipping_international as { method: string; price: number } | null
  const intlService = INTL_SERVICE[intl?.method ?? ''] ?? 'StandardInternational'
  const intlPrice = intl?.price ?? 25

  return `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <Item>
    <Title>${title}</Title>
    <Description><![CDATA[${desc}]]></Description>
    <PrimaryCategory><CategoryID>${categoryId}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${price}</StartPrice>
    <Quantity>${qty}</Quantity>
    <ListingDuration>GTC</ListingDuration>
    <ConditionID>${conditionId}</ConditionID>
    <Country>IL</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>5</DispatchTimeMax>
    <ListingType>FixedPriceItem</ListingType>
    <Location>${location}</Location>
    ${pictureXml ? `<PictureDetails>\n${pictureXml}\n    </PictureDetails>` : ''}
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>USPSMedia</ShippingService>
        <ShippingServiceCost currencyID="USD">0</ShippingServiceCost>
        <FreeShipping>true</FreeShipping>
      </ShippingServiceOptions>
      <InternationalShippingServiceOption>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${intlService}</ShippingService>
        <ShippingServiceCost currencyID="USD">${intlPrice}</ShippingServiceCost>
        <ShipToLocation>Worldwide</ShipToLocation>
      </InternationalShippingServiceOption>
    </ShippingDetails>
    <ReturnPolicy><ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption></ReturnPolicy>
    ${specificsXml ? `<ItemSpecifics>\n${specificsXml}\n    </ItemSpecifics>` : ''}
    ${p.sku ? `<SKU>${escapeXml(p.sku)}</SKU>` : ''}
  </Item>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</AddItemRequest>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildReviseItemXml(token: string, p: any): string {
  const title = escapeXml((p.title || `${p.manufacturer} ${p.model}`).slice(0, 80))
  const desc = (p.description || String(title)).replace(/]]>/g, ']] >')
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <Item>
    <ItemID>${p.ebay_item_number}</ItemID>
    <Title>${title}</Title>
    <Description><![CDATA[${desc}]]></Description>
    <StartPrice currencyID="USD">${p.price ?? 0}</StartPrice>
    <Quantity>${p.quantity ?? 1}</Quantity>
  </Item>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</ReviseItemRequest>`
}

function buildEndItemXml(token: string, itemId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <EndingReason>NotAvailable</EndingReason>
  <ItemID>${itemId}</ItemID>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</EndItemRequest>`
}

function parseAck(xml: string, rootKey: string): { ok: boolean; error?: string; response?: Record<string, unknown> } {
  const parsed = parser.parse(xml)
  const response = parsed?.[rootKey]
  if (!response) return { ok: false, error: 'תגובה לא תקינה מ-eBay: ' + xml.slice(0, 200) }
  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = response.Errors ?? response.Error ?? []
    const first = Array.isArray(errors) ? errors[0] : errors
    const msg = (first as Record<string, string>)?.LongMessage ?? (first as Record<string, string>)?.ShortMessage ?? `eBay Ack: ${ack}`
    return { ok: false, error: msg }
  }
  return { ok: true, response }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { action, productId }: { action: string; productId: string } = body

  if (!action || !productId) {
    return NextResponse.json({ error: 'חסרים פרמטרים: action ו-productId' }, { status: 400 })
  }

  const supabase = getClient()

  const { data: product, error: pErr } = await supabase
    .from('products').select('*').eq('id', productId).single()
  if (pErr || !product) {
    return NextResponse.json({ error: 'מוצר לא נמצא' }, { status: 404 })
  }

  const settings = await loadSettings(supabase)
  const { EBAY_APP_ID, EBAY_CERT_ID, EBAY_DEV_ID, EBAY_USER_TOKEN, EBAY_SANDBOX } = settings
  if (!EBAY_APP_ID || !EBAY_USER_TOKEN) {
    return NextResponse.json({ error: 'פרטי eBay API חסרים — הגדר App ID ו-User Token בהגדרות' }, { status: 400 })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const endpoint = isSandbox ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll'

  async function callEbay(callName: string, xmlBody: string): Promise<string> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(EBAY_APP_ID, EBAY_DEV_ID ?? '', EBAY_CERT_ID ?? '', callName),
      body: xmlBody,
      signal: AbortSignal.timeout(30000),
    })
    return res.text()
  }

  // ── AddItem ────────────────────────────────────────────────────────────────
  if (action === 'add') {
    let xml: string
    try { xml = await callEbay('AddItem', buildAddItemXml(EBAY_USER_TOKEN, product)) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error, response } = parseAck(xml, 'AddItemResponse')
    if (!ok) return NextResponse.json({ error }, { status: 200 })

    const itemId = String((response as Record<string, unknown>).ItemID)
    const ebayUrl = isSandbox
      ? `https://sandbox.ebay.com/itm/${itemId}`
      : `https://www.ebay.com/itm/${itemId}`

    await supabase.from('products').update({
      ebay_item_number: itemId,
      ebay_listing_id: itemId,
      ebay_url: ebayUrl,
      status_ebay: 'active',
      ebay_published_at: new Date().toISOString(),
    }).eq('id', productId)

    return NextResponse.json({ success: true, itemId, ebayUrl })

  // ── ReviseItem ─────────────────────────────────────────────────────────────
  } else if (action === 'revise') {
    if (!product.ebay_item_number) {
      return NextResponse.json({ error: 'המוצר לא פורסם ב-eBay עדיין' }, { status: 400 })
    }
    let xml: string
    try { xml = await callEbay('ReviseItem', buildReviseItemXml(EBAY_USER_TOKEN, product)) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error } = parseAck(xml, 'ReviseItemResponse')
    if (!ok) return NextResponse.json({ error }, { status: 200 })

    await supabase.from('products').update({ status_ebay: 'active' }).eq('id', productId)
    return NextResponse.json({ success: true })

  // ── EndItem ────────────────────────────────────────────────────────────────
  } else if (action === 'end') {
    if (!product.ebay_item_number) {
      return NextResponse.json({ error: 'המוצר לא פורסם ב-eBay עדיין' }, { status: 400 })
    }
    let xml: string
    try { xml = await callEbay('EndItem', buildEndItemXml(EBAY_USER_TOKEN, product.ebay_item_number)) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error } = parseAck(xml, 'EndItemResponse')
    if (!ok) return NextResponse.json({ error }, { status: 200 })

    await supabase.from('products').update({ status_ebay: 'ended' }).eq('id', productId)
    return NextResponse.json({ success: true })

  } else {
    return NextResponse.json({ error: `פעולה לא מוכרת: ${action}` }, { status: 400 })
  }
}
