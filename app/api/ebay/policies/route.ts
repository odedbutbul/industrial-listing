import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET() {
  const supabase = getClient()
  const { data } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value ?? '']))

  const token = settings.EBAY_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'EBAY_USER_TOKEN missing' }, { status: 400 })
  }

  const isSandbox = settings.EBAY_SANDBOX !== 'false'
  const base = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
  }

  const endpoints: Record<string, string> = {
    payment: base + '/sell/account/v1/payment_policy?marketplace_id=EBAY_US',
    returnPolicy: base + '/sell/account/v1/return_policy?marketplace_id=EBAY_US',
    shipping: base + '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US',
  } 

  const results: Record<string, unknown> = {}

  for (const [key, url] of Object.entries(endpoints)) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
      const json = await res.json()
      if (!res.ok) {
        results[key] = { error: json }
        continue
      }
      if (key === 'payment') {
        results[key] = (json.paymentPolicies || []).map((p: any) => ({ id: p.paymentPolicyId, name: p.name }))
      } else if (key === 'returnPolicy') {
        results[key] = (json.returnPolicies || []).map((p: any) => ({ id: p.returnPolicyId, name: p.name }))
      } else {
        results[key] = (json.fulfillmentPolicies || []).map((p: any) => ({ id: p.fulfillmentPolicyId, name: p.name }))
      }
    } catch (err) {
      results[key] = { error: String(err) }
    }
  }

  return NextResponse.json(results)
}