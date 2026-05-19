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

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true })

function buildHeaders(token: string, callName: string) {
  return {
    'X-EBAY-API-IAF-TOKEN': token,
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '1271',
    'X-EBAY-API-CALL-NAME': callName,
    'Content-Type': 'text/xml',
  }
}

// GET /api/ebay/diagnose — run GetUser + GeteBayDetails to detect Business Policies opt-in
export async function GET(): Promise<Response> {
  const supabase = getClient()
  const settings = await loadSettings(supabase)
  const { EBAY_USER_TOKEN, EBAY_SANDBOX } = settings

  if (!EBAY_USER_TOKEN) {
    return NextResponse.json({ error: 'eBay User Token חסר' }, { status: 400 })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const endpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll'

  async function callEbay(callName: string, xmlBody: string) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(EBAY_USER_TOKEN, callName),
      body: xmlBody,
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    console.log(`[diagnose] ${callName} RESPONSE:\n`, text)
    return { text, parsed: parser.parse(text) }
  }

  // ── GetUser ──────────────────────────────────────────────────────────────
  const getUserXml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
</GetUserRequest>`

  console.log('[diagnose] GetUser XML:\n', getUserXml)
  const getUserResult = await callEbay('GetUser', getUserXml).catch((e) => ({ error: String(e), text: '', parsed: null }))

  // ── GeteBayDetails (BusinessSeller) ──────────────────────────────────────
  const getDetailsXml = `<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
  <DetailName>BusinessSeller</DetailName>
</GeteBayDetailsRequest>`

  console.log('[diagnose] GeteBayDetails XML:\n', getDetailsXml)
  const getDetailsResult = await callEbay('GeteBayDetails', getDetailsXml).catch((e) => ({ error: String(e), text: '', parsed: null }))

  // ── Extract relevant fields ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userResponse = (getUserResult as any).parsed?.GetUserResponse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailsResponse = (getDetailsResult as any).parsed?.GeteBayDetailsResponse

  const userInfo = userResponse ? {
    ack: userResponse.Ack,
    userId: userResponse.User?.UserID,
    sellerLevel: userResponse.User?.SellerInfo?.SellerLevel,
    storeOwner: userResponse.User?.SellerInfo?.StoreOwner,
    qualifiesForB2BVAT: userResponse.User?.SellerInfo?.QualifiesForB2BVAT,
    businessSeller: userResponse.User?.SellerInfo?.BusinessSeller,
    registrationAddress: userResponse.User?.RegistrationAddress?.CountryName,
    errors: userResponse.Errors ?? null,
  } : null

  const detailsInfo = detailsResponse ? {
    ack: detailsResponse.Ack,
    errors: detailsResponse.Errors ?? null,
    raw: JSON.stringify(detailsResponse).slice(0, 800),
  } : null

  return NextResponse.json({
    isSandbox,
    getUser: {
      ...userInfo,
      rawXml: (getUserResult as { text: string }).text,
    },
    geteBayDetails: {
      ...detailsInfo,
      rawXml: (getDetailsResult as { text: string }).text,
    },
  })
}
