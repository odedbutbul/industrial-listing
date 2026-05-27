import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // User declined consent
  if (error || !code) {
    const reason = error || 'לא התקבל authorization code'
    return NextResponse.redirect(
      new URL(`/settings?ebay_oauth=error&reason=${encodeURIComponent(reason)}`, request.url)
    )
  }

  const supabase = getClient()
  const { data } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))

  const appId = settings.EBAY_APP_ID
  const certId = settings.EBAY_CERT_ID
  const ruName = settings.EBAY_RUNAME
  const isSandbox = settings.EBAY_SANDBOX !== 'false'

  if (!appId || !certId || !ruName) {
    return NextResponse.redirect(
      new URL('/settings?ebay_oauth=error&reason=missing_credentials', request.url)
    )
  }

  // Exchange authorization code for access token + refresh token
  const tokenUrl = isSandbox
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token'

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64')

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ruName,
      }).toString(),
      signal: AbortSignal.timeout(15000),
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`
      console.error('[oauth/callback] Token exchange failed:', errMsg, tokenData)
      return NextResponse.redirect(
        new URL(`/settings?ebay_oauth=error&reason=${encodeURIComponent(errMsg)}`, request.url)
      )
    }

    // Save tokens to settings
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 7200) * 1000).toISOString()

    const rows = [
      { key: 'EBAY_OAUTH_ACCESS_TOKEN', value: tokenData.access_token, updated_at: now },
      { key: 'EBAY_OAUTH_REFRESH_TOKEN', value: tokenData.refresh_token || '', updated_at: now },
      { key: 'EBAY_OAUTH_TOKEN_EXPIRES_AT', value: expiresAt, updated_at: now },
      { key: 'EBAY_USER_TOKEN', value: tokenData.access_token, updated_at: now },
    ]

    const { error: upsertError } = await supabase
      .from('settings')
      .upsert(rows, { onConflict: 'key' })

    if (upsertError) {
      console.error('[oauth/callback] Failed to save tokens:', upsertError)
      return NextResponse.redirect(
        new URL('/settings?ebay_oauth=error&reason=save_failed', request.url)
      )
    }

    console.log('[oauth/callback] Tokens saved successfully. Expires at:', expiresAt)
    return NextResponse.redirect(new URL('/settings?ebay_oauth=success', request.url))

  } catch (err) {
    console.error('[oauth/callback] Error:', err)
    return NextResponse.redirect(
      new URL(`/settings?ebay_oauth=error&reason=${encodeURIComponent(String(err))}`, request.url)
    )
  }
}
