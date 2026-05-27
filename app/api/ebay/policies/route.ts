import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET() {
  const supabase = getClient()
  const { data } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))

  const token = settings.EBAY_USER_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'EBAY_USER_TOKEN missing' }, { status: 400 })
  }

  const isSandbox = settings.EBAY_SANDBOX !== 'false'
  const baseUrl = isSandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com'

  const types = ['PAYMENT', 'RETURN_POLICY', 'SHIPPING'] as const
  const results: Record<string, unknown[]> = {}

  for (const type of types) {
    try {
      const url = baseUrl + '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US'
      let endpoint = ''
      if (type === 'PAYMENT') endpoint = baseUrl + '/sell/account/v1/payment_policy?marketplace_id=EBAY_US'
      else if (type === 'RETURN_POLICY') endpoint = baseUrl + '/sell/account/v1/return_policy?marketplace_id=EBAY_US'
      else endpoint = baseUrl + '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US'

      const res = await fetch(endpoint, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      })

      const json = await res.json()
      if (!res.ok) {
        results[type] = [{ error: json }]
        continue
      }

      if (type === 'PAYMENT') results[type] = json.paymentPolicies || []
      else if (type === 'RETURN_POLICY') results[type] = json.returnPolicies || []
      else results[type] = json.fulfillmentPolicies || []
    } catch (err) {
      results[type] = [{ error: String(err) }]
    }
  }

  return NextResponse.json({ policies: results })
}
