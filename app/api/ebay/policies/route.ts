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

// Step 1 — get Application Token via client_credentials
async function getAppToken(appId: string, certId: string, isSandbox: boolean): Promise<string> {
  const tokenUrl = isSandbox
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token'

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64')
  const scope = 'https://api.ebay.com/oauth/api_scope/sell.account.readonly'

  console.log('[policies] fetching app token from', tokenUrl)
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json()
  console.log('[policies] token response status:', res.status, JSON.stringify(json).slice(0, 300))
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? `HTTP ${res.status}`)
  }
  return json.access_token as string
}

// Step 2 — call Account REST API with the app token
async function fetchPolicyList(baseUrl: string, path: string, token: string) {
  const url = `${baseUrl}${path}?marketplace_id=${MARKETPLACE_ID}`
  console.log('[policies] GET', url)
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE_ID,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json()
  console.log('[policies] response status:', res.status, JSON.stringify(json).slice(0, 400))
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message ?? json?.error_description ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json
}

// GET /api/ebay/policies
export async function GET(): Promise<Response> {
  const supabase = getClient()
  const settings = await loadSettings(supabase)
  const { EBAY_APP_ID, EBAY_CERT_ID, EBAY_SANDBOX } = settings

  if (!EBAY_APP_ID || !EBAY_CERT_ID) {
    return NextResponse.json({ error: 'חסרים App ID ו-Cert ID בהגדרות eBay' }, { status: 400 })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const baseUrl = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'

  let token: string
  try {
    token = await getAppToken(EBAY_APP_ID, EBAY_CERT_ID, isSandbox)
  } catch (err) {
    return NextResponse.json({ error: `שגיאה בקבלת Application Token: ${String(err)}` }, { status: 200 })
  }

  try {
    const [shippingData, returnData, paymentData] = await Promise.all([
      fetchPolicyList(baseUrl, '/sell/account/v1/fulfillment_policy', token),
      fetchPolicyList(baseUrl, '/sell/account/v1/return_policy', token),
      fetchPolicyList(baseUrl, '/sell/account/v1/payment_policy', token),
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
