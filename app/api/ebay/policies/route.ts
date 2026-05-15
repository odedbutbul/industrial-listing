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
  isArray: (name) => ['PaymentProfile', 'ReturnPolicyProfile', 'ShippingProfile', 'Errors'].includes(name),
  parseTagValue: true,
})

export interface SellerProfile {
  id: string
  name: string
}

export interface PoliciesResult {
  paymentProfiles: SellerProfile[]
  returnProfiles: SellerProfile[]
  shippingProfiles: SellerProfile[]
  error?: string
  raw?: string
}

// GET /api/ebay/policies — fetch seller profiles via GetSellerProfiles
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

  const headers = {
    'X-EBAY-API-IAF-TOKEN': EBAY_USER_TOKEN,
    'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '1271',
    'X-EBAY-API-CALL-NAME': 'GetSellerProfiles',
    'Content-Type': 'text/xml',
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerProfilesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
</GetSellerProfilesRequest>`

  console.log('[ebay/policies] GetSellerProfiles XML:\n', xml)

  let responseXml: string
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: xml, signal: AbortSignal.timeout(20000) })
    responseXml = await res.text()
    console.log('[ebay/policies] response:\n', responseXml.slice(0, 1000))
  } catch (err) {
    return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 })
  }

  const parsed = parser.parse(responseXml)
  const response = parsed?.GetSellerProfilesResponse
  if (!response) {
    return NextResponse.json({ error: 'תגובה לא תקינה מ-eBay', raw: responseXml.slice(0, 400) }, { status: 502 })
  }

  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = response.Errors ?? []
    const first = Array.isArray(errors) ? errors[0] : errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (first as any)?.LongMessage ?? (first as any)?.ShortMessage ?? `eBay Ack: ${ack}`
    return NextResponse.json({ error: msg, raw: responseXml.slice(0, 400) }, { status: 200 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPayment: any[] = response?.PaymentProfileList?.PaymentProfile ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawReturn: any[]  = response?.ReturnPolicyProfileList?.ReturnPolicyProfile ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawShipping: any[] = response?.ShippingProfileList?.ShippingProfile ?? []

  const result: PoliciesResult = {
    paymentProfiles:  rawPayment.map((p)  => ({ id: String(p.PaymentProfileID  ?? ''), name: String(p.PaymentProfileName  ?? '') })),
    returnProfiles:   rawReturn.map((p)   => ({ id: String(p.ReturnPolicyProfileID  ?? ''), name: String(p.ReturnPolicyProfileName  ?? '') })),
    shippingProfiles: rawShipping.map((p) => ({ id: String(p.ShippingProfileID ?? ''), name: String(p.ShippingProfileName ?? '') })),
  }

  return NextResponse.json(result)
}
