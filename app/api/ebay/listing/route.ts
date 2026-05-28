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

// Auto-refresh token if expired or about to expire (5 min buffer)
async function getValidToken(supabase: ReturnType<typeof getClient>, settings: Record<string, string>): Promise<string> {
  const token = settings.EBAY_USER_TOKEN
  const expiresAt = settings.EBAY_OAUTH_TOKEN_EXPIRES_AT
  const refreshToken = settings.EBAY_OAUTH_REFRESH_TOKEN
  const appId = settings.EBAY_APP_ID
  const certId = settings.EBAY_CERT_ID
  const isSandbox = settings.EBAY_SANDBOX !== 'false'

  if (!token) throw new Error('eBay User Token missing')

  // Check if token is still valid (with 5 min buffer)
  if (expiresAt) {
    const expiryTime = new Date(expiresAt).getTime()
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    if (expiryTime - now > fiveMinutes) {
      return token // Token still valid
    }
  }

  // Token expired or about to expire - try refresh
  if (!refreshToken || !appId || !certId) {
    console.warn('[listing] Token expired but no refresh credentials available')
    return token // Return expired token, eBay will reject and user will see the error
  }

  console.log('[listing] Token expired, refreshing...')
  const tokenUrl = isSandbox
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token'

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64')
  const SCOPES = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  ].join(' ')

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    }).toString(),
    signal: AbortSignal.timeout(15000),
  })

  const tokenData = await res.json()

  if (!res.ok || !tokenData.access_token) {
    console.error('[listing] Token refresh failed:', tokenData)
    throw new Error('Token refresh failed - please reconnect to eBay in Settings')
  }

  const now = new Date().toISOString()
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 7200) * 1000).toISOString()

  await supabase.from('settings').upsert([
    { key: 'EBAY_OAUTH_ACCESS_TOKEN', value: tokenData.access_token, updated_at: now },
    { key: 'EBAY_OAUTH_TOKEN_EXPIRES_AT', value: newExpiresAt, updated_at: now },
    { key: 'EBAY_USER_TOKEN', value: tokenData.access_token, updated_at: now },
  ], { onConflict: 'key' })

  console.log('[listing] Token refreshed automatically. Expires at:', newExpiresAt)
  return tokenData.access_token
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
  'New \u2013 Open box': '1500',
  'Seller refurbished': '2500',
  'Used': '3000',
  'For parts or not working': '7000',
}

interface ProfileIds {
  paymentId: string
  returnId: string
  shippingId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAddItemXml(p: any, ids: ProfileIds, verify = false): string {
  const title = escapeXml((p.title || `${p.manufacturer} ${p.model}`).slice(0, 80))
  const conditionId = CONDITION_ID[p.condition] ?? '3000'
  const price = p.price ?? 0
  const qty = p.quantity ?? 1
  const categoryId = (!p.ebay_category || p.ebay_category === 'Other') ? '139971' : p.ebay_category
  const location = escapeXml(p.location || 'Israel')
  const desc = (p.description || String(title)).replace(/]]>/g, ']] >')

  const pictureXml = ((p.images ?? []) as string[]).slice(0, 12)
    .map((u: string) => `      <PictureURL>${u}</PictureURL>`).join('\n')

  const specificsXml = [
    (p.brand || p.manufacturer) ? `      <NameValueList><Name>Brand</Name><Value>${escapeXml(p.brand || p.manufacturer)}</Value></NameValueList>` : '',
    `      <NameValueList><Name>Model</Name><Value>${escapeXml(p.model || p.mpn || 'N/A')}</Value></NameValueList>`,
    p.mpn               ? `      <NameValueList><Name>MPN</Name><Value>${escapeXml(p.mpn)}</Value></NameValueList>` : '',
    p.country_of_origin ? `      <NameValueList><Name>Country/Region of Manufacture</Name><Value>${escapeXml(p.country_of_origin)}</Value></NameValueList>` : '',
  ].filter(Boolean).join('\n')

  // Use SellerProfiles (Business Policies) when IDs are configured
  const shippingBlock = (ids.shippingId && ids.returnId) ? `
    <SellerProfiles>
      ${ids.paymentId ? `<SellerPaymentProfile>
        <PaymentProfileID>${ids.paymentId}</PaymentProfileID>
      </SellerPaymentProfile>` : ''}
      <SellerReturnProfile>
        <ReturnProfileID>${ids.returnId}</ReturnProfileID>
      </SellerReturnProfile>
      <SellerShippingProfile>
        <ShippingProfileID>${ids.shippingId}</ShippingProfileID>
      </SellerShippingProfile>
    </SellerProfiles>` : `
    <ShipToLocations>Worldwide</ShipToLocations>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>EconomyShippingFromOutsideUS</ShippingService>
        <ShippingServiceCost currencyID="USD">0</ShippingServiceCost>
        <FreeShipping>true</FreeShipping>
      </ShippingServiceOptions>
    </ShippingDetails>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>`

  const rootTag = verify ? 'VerifyAddItemRequest' : 'AddItemRequest'
  return `<?xml version="1.0" encoding="utf-8"?>
<${rootTag} xmlns="urn:ebay:apis:eBLBaseComponents">
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
    ${shippingBlock}
    ${specificsXml ? `<ItemSpecifics>\n${specificsXml}\n    </ItemSpecifics>` : ''}
    ${p.sku ? `<SKU>${escapeXml(p.sku)}</SKU>` : ''}
  </Item>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</${rootTag}>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildReviseItemXml(p: any): string {
  const title = escapeXml((p.title || `${p.manufacturer} ${p.model}`).slice(0, 80))
  const desc = (p.description || String(title)).replace(/]]>/g, ']] >')

  const specificsXml = [
    (p.brand || p.manufacturer) ? `      <NameValueList><Name>Brand</Name><Value>${escapeXml(p.brand || p.manufacturer)}</Value></NameValueList>` : '',
    `      <NameValueList><Name>Model</Name><Value>${escapeXml(p.model || p.mpn || 'N/A')}</Value></NameValueList>`,
    p.mpn               ? `      <NameValueList><Name>MPN</Name><Value>${escapeXml(p.mpn)}</Value></NameValueList>` : '',
    p.country_of_origin ? `      <NameValueList><Name>Country/Region of Manufacture</Name><Value>${escapeXml(p.country_of_origin)}</Value></NameValueList>` : '',
  ].filter(Boolean).join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
  <Item>
    <ItemID>${p.ebay_item_number}</ItemID>
    <Title>${title}</Title>
    <Description><![CDATA[${desc}]]></Description>
    <StartPrice currencyID="USD">${p.price ?? 0}</StartPrice>
    <Quantity>${p.quantity ?? 1}</Quantity>
    ${specificsXml ? `<ItemSpecifics>\n${specificsXml}\n    </ItemSpecifics>` : ''}
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

function parseAck(xml: string, rootKey: string): { ok: boolean; error?: string; rawErrors?: unknown[]; response?: Record<string, unknown> } {
  const parsed = parser.parse(xml)
  const response = parsed?.[rootKey]
  if (!response) return { ok: false, error: 'תגובה לא תקינה מ-eBay: ' + xml.slice(0, 500) }
  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = response.Errors ?? response.Error ?? []
    const errArr: unknown[] = Array.isArray(errors) ? errors : [errors]
    const first = errArr[0] as Record<string, string>
    const msg = first?.LongMessage ?? first?.ShortMessage ?? `eBay Ack: ${ack}`
    console.log(`[ebay/listing] parseAck ERRORS (${rootKey}):`, JSON.stringify(errArr, null, 2))
    return { ok: false, error: msg, rawErrors: errArr }
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
  const {
    EBAY_SANDBOX,
    EBAY_PAYMENT_PROFILE_ID, EBAY_RETURN_PROFILE_ID, EBAY_SHIPPING_PROFILE_ID,
  } = settings

  let validToken: string
  try {
    validToken = await getValidToken(supabase, settings)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 401 })
  }

  const profileIds: ProfileIds = {
    paymentId:  EBAY_PAYMENT_PROFILE_ID  ?? '',
    returnId:   EBAY_RETURN_PROFILE_ID   ?? '',
    shippingId: EBAY_SHIPPING_PROFILE_ID ?? '',
  }
  console.log('[ebay/listing] profileIds:', profileIds)

  const isSandbox = EBAY_SANDBOX !== 'false'
  const endpoint = isSandbox ? 'https://api.sandbox.ebay.com/ws/api.dll' : 'https://api.ebay.com/ws/api.dll'

  async function callEbay(callName: string, xmlBody: string): Promise<string> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(validToken, callName),
      body: xmlBody,
      signal: AbortSignal.timeout(30000),
    })
    const text = await res.text()
    console.log(`[ebay/listing] ${callName} RESPONSE (HTTP ${res.status}):\n`, text)
    return text
  }

  if (action === 'verify') {
    const verifyXml = buildAddItemXml(product, profileIds, true)
    console.log('[ebay/listing] VerifyAddItem XML:\n', verifyXml)
    let xml: string
    try { xml = await callEbay('VerifyAddItem', verifyXml) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error, rawErrors } = parseAck(xml, 'VerifyAddItemResponse')
    if (!ok) return NextResponse.json({ error, rawErrors, rawXml: xml }, { status: 200 })
    return NextResponse.json({ success: true, message: 'VerifyAddItem עבר — המוצר תקין לפרסום' })

  } else if (action === 'add') {
    const addXml = buildAddItemXml(product, profileIds)
    console.log('[ebay/listing] AddItem XML:\n', addXml)
    let xml: string
    try { xml = await callEbay('AddItem', addXml) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error, rawErrors, response } = parseAck(xml, 'AddItemResponse')
    if (!ok) return NextResponse.json({ error, rawErrors, rawXml: xml }, { status: 200 })

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

  } else if (action === 'revise') {
    if (!product.ebay_item_number) {
      return NextResponse.json({ error: 'המוצר לא פורסם ב-eBay עדיין' }, { status: 400 })
    }
    const reviseXml = buildReviseItemXml(product)
    console.log('[ebay/listing] ReviseItem XML:\n', reviseXml)
    let xml: string
    try { xml = await callEbay('ReviseItem', reviseXml) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error, rawErrors } = parseAck(xml, 'ReviseItemResponse')
    if (!ok) return NextResponse.json({ error, rawErrors, rawXml: xml }, { status: 200 })

    await supabase.from('products').update({ status_ebay: 'active' }).eq('id', productId)
    return NextResponse.json({ success: true })

  } else if (action === 'end') {
    if (!product.ebay_item_number) {
      return NextResponse.json({ error: 'המוצר לא פורסם ב-eBay עדיין' }, { status: 400 })
    }
    const endXml = buildEndItemXml(product.ebay_item_number)
    console.log('[ebay/listing] EndItem XML:\n', endXml)
    let xml: string
    try { xml = await callEbay('EndItem', endXml) }
    catch (err) { return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 }) }

    const { ok, error, rawErrors } = parseAck(xml, 'EndItemResponse')
    if (!ok) return NextResponse.json({ error, rawErrors, rawXml: xml }, { status: 200 })

    await supabase.from('products').update({ status_ebay: 'ended' }).eq('id', productId)
    return NextResponse.json({ success: true })

  } else {
    return NextResponse.json({ error: `פעולה לא מוכרת: ${action}` }, { status: 400 })
  }
}