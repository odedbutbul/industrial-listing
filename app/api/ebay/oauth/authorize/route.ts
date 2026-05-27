import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
].join(' ')

export async function GET(): Promise<Response> {
  const supabase = getClient()
  const { data } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))

  const appId = settings.EBAY_APP_ID
  const ruName = settings.EBAY_RUNAME
  const isSandbox = settings.EBAY_SANDBOX !== 'false'

  if (!appId || !ruName) {
    return NextResponse.json(
      { error: 'חסר EBAY_APP_ID או EBAY_RUNAME בהגדרות. הגדר אותם בדף Settings.' },
      { status: 400 }
    )
  }

  const baseAuth = isSandbox
    ? 'https://auth.sandbox.ebay.com'
    : 'https://auth.ebay.com'

  const authUrl = `${baseAuth}/oauth2/authorize?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(ruName)}` +
    `&scope=${encodeURIComponent(SCOPES)}`

  return NextResponse.redirect(authUrl)
}
