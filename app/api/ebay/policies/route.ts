import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

export interface SellerProfile {
  id: string
  name: string
}

export interface PoliciesResult {
  paymentProfiles: SellerProfile[]
  returnProfiles: SellerProfile[]
  shippingProfiles: SellerProfile[]
  error?: string
}

const MARKETPLACE_ID = 'EBAY_US'

// GET /api/ebay/policies — fetch business policies via eBay REST Account API
export async function GET(): Promise<Response> {
  const supabase = getClient()
  const settings = await loadSettings(supabase)
  const { EBAY_USER_TOKEN, EBAY_SANDBOX } = settings

  if (!EBAY_USER_TOKEN) {
    return NextResponse.json({ error: 'eBay User Token חסר' }, { status: 400 })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const baseUrl = isSandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com'

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${EBAY_USER_TOKEN}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
    'Accept': 'application/json',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchPolicy(path: string): Promise<any> {
    const url = `${baseUrl}${path}?marketplace_id=${MARKETPLACE_ID}`
    console.log('[ebay/policies] GET', url)
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    const json = await res.json()
    console.log('[ebay/policies] status:', res.status, JSON.stringify(json).slice(0, 400))
    if (!res.ok) {
      const msg = (json?.errors?.[0]?.message) ?? json?.error_description ?? `HTTP ${res.status}`
      throw new Error(msg)
    }
    return json
  }

  try {
    const [shippingData, returnData, paymentData] = await Promise.all([
      fetchPolicy('/sell/account/v1/fulfillment_policy'),
      fetchPolicy('/sell/account/v1/return_policy'),
      fetchPolicy('/sell/account/v1/payment_policy'),
    ])

    const result: PoliciesResult = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shippingProfiles: (shippingData.fulfillmentPolicies ?? []).map((p: any) => ({
        id: String(p.fulfillmentPolicyId ?? ''),
        name: String(p.name ?? ''),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      returnProfiles: (returnData.returnPolicies ?? []).map((p: any) => ({
        id: String(p.returnPolicyId ?? ''),
        name: String(p.name ?? ''),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentProfiles: (paymentData.paymentPolicies ?? []).map((p: any) => ({
        id: String(p.paymentPolicyId ?? ''),
        name: String(p.name ?? ''),
      })),
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: `שגיאה בטעינת הפוליסות: ${String(err)}` }, { status: 200 })
  }
}
