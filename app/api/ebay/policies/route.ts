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
  isArray: (name) => ['SupportedSellerProfile'].includes(name),
  parseTagValue: true,
})

export interface SellerProfile {
  id: string
  name: string
  type: 'SHIPPING' | 'RETURN_POLICY' | 'PAYMENT'
}

export interface PoliciesResult {
  optedIn: boolean
  shippingProfiles: SellerProfile[]
  returnProfiles: SellerProfile[]
  paymentProfiles: SellerProfile[]
  error?: string
}

// GET /api/ebay/policies — fetch seller profiles from GetUserPreferences
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
    'X-EBAY-API-CALL-NAME': 'GetUserPreferences',
    'Content-Type': 'text/xml',
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Version>1271</Version>
  <ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>
</GetUserPreferencesRequest>`

  console.log('[ebay/policies] GetUserPreferences XML:\n', xml)

  let responseXml: string
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: xml,
      signal: AbortSignal.timeout(20000),
    })
    responseXml = await res.text()
    console.log('[ebay/policies] response snippet:', responseXml.slice(0, 500))
  } catch (err) {
    return NextResponse.json({ error: `לא ניתן להתחבר ל-eBay: ${String(err)}` }, { status: 502 })
  }

  const parsed = parser.parse(responseXml)
  const response = parsed?.GetUserPreferencesResponse
  if (!response) {
    return NextResponse.json({ error: 'תגובה לא תקינה מ-eBay', raw: responseXml.slice(0, 300) }, { status: 502 })
  }

  const ack = String(response.Ack ?? '')
  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = response.Errors ?? []
    const first = Array.isArray(errors) ? errors[0] : errors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (first as any)?.LongMessage ?? (first as any)?.ShortMessage ?? `eBay Ack: ${ack}`
    return NextResponse.json({ error: msg }, { status: 200 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawProfiles: any[] = response?.SellerProfilePreferences?.SupportedSellerProfiles?.SupportedSellerProfile ?? []
  const profiles: SellerProfile[] = rawProfiles.map((p) => ({
    id: String(p.ProfileID ?? ''),
    name: String(p.ProfileName ?? ''),
    type: String(p.ProfileType ?? '') as SellerProfile['type'],
  }))

  const optedIn = profiles.length > 0

  const result: PoliciesResult = {
    optedIn,
    shippingProfiles: profiles.filter((p) => p.type === 'SHIPPING'),
    returnProfiles:   profiles.filter((p) => p.type === 'RETURN_POLICY'),
    paymentProfiles:  profiles.filter((p) => p.type === 'PAYMENT'),
  }

  return NextResponse.json(result)
}
