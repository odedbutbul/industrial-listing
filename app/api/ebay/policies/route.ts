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

async function getAppToken(appId: string, certId: string, isSandbox: boolean): Promise<string> {
  const tokenUrl = isSandbox
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token'
  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64')

  // Try sell.account.readonly first, fall back to basic scope
  for (const scope of [
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope',
  ]) {
    console.log('[policies] trying token scope:', scope)
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
      signal: AbortSignal.timeout(15000),
    })
    const json = await res.json()
    console.log('[policies] token response status:', res.status, JSON.stringify(json).slice(0, 300))
    if (res.ok && json.access_token) return json.access_token as string
  }
  throw new Error('לא הצליח לקבל Application Token — בדוק App ID ו-Cert ID')
}

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
  if (!res.ok) throw new Error(json?.errors?.[0]?.message ?? `HTTP ${res.status}`)
  return json
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProfiles(data: any, listKey: string, idKey: string): SellerProfile[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data[listKey] ?? []).map((p: any) => ({ id: String(p[idKey] ?? ''), name: String(p.name ?? '') }))
}

// GET /api/ebay/policies
export async function GET(): Promise<Response> {
  const supabase = getClient()
  const settings = await loadSettings(supabase)
  const { EBAY_USER_TOKEN, EBAY_APP_ID, EBAY_CERT_ID, EBAY_SANDBOX } = settings

  if (!EBAY_USER_TOKEN && (!EBAY_APP_ID || !EBAY_CERT_ID)) {
    return NextResponse.json({ error: 'חסר User Token או App ID+Cert ID בהגדרות eBay' }, { status: 400 })
  }

  const isSandbox = EBAY_SANDBOX !== 'false'
  const baseUrl = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'

  // Strategy 1: User Token as Bearer (OAuth IAF token works as Bearer for REST APIs)
  // Strategy 2: Application Token via client_credentials
  const tokenSources: Array<() => Promise<string>> = []
  if (EBAY_USER_TOKEN) tokenSources.push(async () => EBAY_USER_TOKEN)
  if (EBAY_APP_ID && EBAY_CERT_ID) tokenSources.push(() => getAppToken(EBAY_APP_ID, EBAY_CERT_ID, isSandbox))

  let lastError = ''
  for (const getToken of tokenSources) {
    try {
      const token = await getToken()
      console.log('[policies] trying token (first 20 chars):', token.slice(0, 20))
      const [shippingData, returnData, paymentData] = await Promise.all([
        fetchPolicyList(baseUrl, '/sell/account/v1/fulfillment_policy', token),
        fetchPolicyList(baseUrl, '/sell/account/v1/return_policy', token),
        fetchPolicyList(baseUrl, '/sell/account/v1/payment_policy', token),
      ])
      const result: PoliciesResult = {
        shippingProfiles: mapProfiles(shippingData, 'fulfillmentPolicies', 'fulfillmentPolicyId'),
        returnProfiles:   mapProfiles(returnData,   'returnPolicies',       'returnPolicyId'),
        paymentProfiles:  mapProfiles(paymentData,  'paymentPolicies',      'paymentPolicyId'),
      }
      return NextResponse.json(result)
    } catch (err) {
      lastError = String(err)
      console.warn('[policies] token source failed:', lastError)
    }
  }

  return NextResponse.json({ error: `שגיאה בטעינת הפוליסות: ${lastError}` }, { status: 200 })
}
