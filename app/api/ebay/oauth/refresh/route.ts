import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(): Promise<Response> {
  const supabase = getClient()
  const { data } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))

  const appId = settings.EBAY_APP_ID
  const certId = settings.EBAY_CERT_ID
  const refreshToken = settings.EBAY_OAUTH_REFRESH_TOKEN
  const isSandbox = settings.EBAY_SANDBOX !== 'false'

  if (!appId || !certId || !refreshToken) {
    return NextResponse.json(
      { error: 'חסר App ID, Cert ID, או Refresh Token. התחבר מחדש ל-eBay.' },
      { status: 400 }
    )
  }

  const tokenUrl = isSandbox
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token'

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64')

  const SCOPES = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  ].join(' ')

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: SCOPES,
      }).toString(),
      signal: AbortSignal.timeout(15000),
    })

    const tokenData = await res.json()

    if (!res.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || `HTTP ${res.status}`
      console.error('[oauth/refresh] Refresh failed:', errMsg)
      return NextResponse.json({ error: errMsg }, { status: 400 })
    }

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 7200) * 1000).toISOString()

    await supabase.from('settings').upsert([
      { key: 'EBAY_OAUTH_ACCESS_TOKEN', value: tokenData.access_token, updated_at: now },
      { key: 'EBAY_OAUTH_TOKEN_EXPIRES_AT', value: expiresAt, updated_at: now },
      { key: 'EBAY_USER_TOKEN', value: tokenData.access_token, updated_at: now },
    ], { onConflict: 'key' })

    console.log('[oauth/refresh] Token refreshed. Expires at:', expiresAt)
    return NextResponse.json({ success: true, expiresAt })

  } catch (err) {
    console.error('[oauth/refresh] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
