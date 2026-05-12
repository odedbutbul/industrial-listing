import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { app_id, cert_id, sandbox } = await request.json()

  if (!app_id || !cert_id) {
    return NextResponse.json({ error: 'נדרש EBAY_APP_ID ו-EBAY_CERT_ID' }, { status: 400 })
  }

  const isSandbox = sandbox === 'true' || sandbox === true
  const baseUrl = isSandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com'

  const credentials = Buffer.from(`${app_id}:${cert_id}`).toString('base64')

  try {
    const res = await fetch(`${baseUrl}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    })

    if (res.ok) {
      return NextResponse.json({ success: true, mode: isSandbox ? 'sandbox' : 'production' })
    }

    const data = await res.json().catch(() => ({}))
    const message = data?.error_description || `שגיאה ${res.status}`
    return NextResponse.json({ success: false, error: message }, { status: 200 })
  } catch {
    return NextResponse.json({ success: false, error: 'לא ניתן להתחבר ל-eBay API' }, { status: 200 })
  }
}
