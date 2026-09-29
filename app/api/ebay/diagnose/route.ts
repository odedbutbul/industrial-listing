import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'
import { getValidAccessToken } from '@/lib/ebay/auth'
import { getEbayConfig } from '@/lib/ebay/config'

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
  // טוקן מ-ebay_tokens (Postgres), עם חידוש אוטומטי
  let EBAY_USER_TOKEN: string
  let config: ReturnType<typeof getEbayConfig>
  try {
    config = getEbayConfig()
    EBAY_USER_TOKEN = await getValidAccessToken()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 401 })
  }

  const isSandbox = config.sandbox
  const endpoint = config.tradingEndpoint

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
