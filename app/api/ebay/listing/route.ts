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

function buildHeaders(token: string, callName: string) {
  return {
    'X-EBAY-API-IAF-TOKEN': token,
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '1271',
    'X-EBAY-API-CALL-NAME': callName,
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
  'New – Open box': '1500',
  'Seller refurbished': '2500',
  'Used': '3000',
  'For parts or not working': '7000',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddItemXml(p: any): string {
  const title = escapeXml((p.title || `${p.manufacturer} ${p.model}`).slice(0, 80))
  const conditionId = CONDITION_ID[p.condition] ?? '3000'
  const price = p.price ?? 0
  const qty = p.quantity ?? 1
  const categoryId = (!p.ebay_category || p.ebay_category === 'Other') ? '139971' : p.ebay_category
  const location = escapeXml(p.location || 'Israel')
  const desc = (p.description || String(title)).replace(/]]>/g, ']] >')

  const pictureXml = ((p.images ?? []) as string[]).slice(0, 12)
    .map((u) => `      <PictureURL>${u}</PictureURL>`).join('\n')

  const specificsXml = [
    (p.brand || p.manufacturer) ? `      <NameValueList><Name>Brand</Name><Value>${escapeXml(p.brand || p.manufacturer)}</Value></NameValueList>` : '',
    p.mpn               ? `      <NameValueList><Name>MPN</Name><Value>${escapeXml(p.mpn)}</Value></NameValueList>` : '',
    p.country_of_origin ? `      <NameValueList><Name>Country/Region of Manufacture</Name><Value>${escapeXml(p.country_of_origin)}</Value></NameValueList>` : '',
  ].filter(Boolean).join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
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
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingType>FixedPriceItem</ListingType>
    <Location>${location}</Location>
    ${pictureXml ? `<PictureDetails>\n${pictureXml}\n    </PictureDetails>` : ''}
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>StandardShippingFromOutsideUS</ShippingService>
        <ShippingServiceCost currencyID="USD">0</ShippingServiceCost>
        <FreeShipping>false</FreeShipping>
      </ShippingServiceOptions>
      <InternationalShippingServiceOption>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>StandardInternationalShipping</ShippingService>
        <ShippingServiceCost currencyID="USD">25</ShippingServiceCost>
        <ShipToLocation>WorldWide</ShipToLocation>
      </InternationalShippingServiceOption>
    </ShippingDetails>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    ${specificsXml ? `<ItemSpecifics>\n${specificsXml}\n    </ItemSpecifics>` : ''}
    ${p.sku ? `<SKU>${escapeXml(p.sku)}</SKU>` : ''}
  </Item>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</AddItemRequest>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildReviseItemXml(p: any): string {
  const title = escapeXml((p.title || `${p.manufacturer} ${p.model}`).slice(0, 80))
  const desc = (p.description || String(title)).replace(/]]>/g, ']] >')
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
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

function buildEndItemXml(itemId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
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
  const { EBAY_USER_TOKEN, EBAY_SANDBOX } = settings
  if (!EBAY_USER_TOKEN) {
    return NextResponse.json({ error: 'eBay User Token חסר — הגדר אותו בהגדרות' }, { status: 400 })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const endpoint = isSandbox ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll'

  async function callEbay(callName: string, xmlBody: string): Promise<string> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(EBAY_USER_TOKEN, callName),
      body: xmlBody,
      signal: AbortSignal.timeout(30000),
    })
    return res.text()
  }

  // ── AddItem ────────────────────────────────────────────────────────────────
  if (action === 'add') {
    const addXml = buildAddItemXml(product)
    console.log('[ebay/listing] AddItem XML:\n', addXml)
    let xml: string
    try { xml = await callEbay('AddItem', addXml) }
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
    const reviseXml = buildReviseItemXml(product)
    console.log('[ebay/listing] ReviseItem XML:\n', reviseXml)
    let xml: string
    try { xml = await callEbay('ReviseItem', reviseXml) }
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
    const endXml = buildEndItemXml(product.ebay_item_number)
    console.log('[ebay/listing] EndItem XML:\n', endXml)
    let xml: string
    try { xml = await callEbay('EndItem', endXml) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error } = parseAck(xml, 'EndItemResponse')
    if (!ok) return NextResponse.json({ error }, { status: 200 })

    await supabase.from('products').update({ status_ebay: 'ended' }).eq('id', productId)
    return NextResponse.json({ success: true })

  } else {
    return NextResponse.json({ error: `פעולה לא מוכרת: ${action}` }, { status: 400 })
  }
}
