import { NextResponse } from 'next/server'
import { EbayConfigError, getEbayConfig } from '@/lib/ebay/config'

// POST /api/settings/ebay-test — בודק שה-App ID וה-Cert ID (ממשתני הסביבה) תקינים,
// ע"י בקשת application token (client_credentials). לא נוגע בחשבון המשתמש.

export const dynamic = 'force-dynamic'

export async function POST() {
  let config: ReturnType<typeof getEbayConfig>
  try {
    config = getEbayConfig()
  } catch (err) {
    if (err instanceof EbayConfigError) return NextResponse.json({ success: false, error: err.message }, { status: 200 })
    throw err
  }

  const credentials = Buffer.from(`${config.appId}:${config.certId}`).toString('base64')

  try {
    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
      signal: AbortSignal.timeout(15000),
    })

    if (res.ok) {
      return NextResponse.json({ success: true, mode: config.environment })
    }

    const data = await res.json().catch(() => ({}))
    const message = data?.error_description || `שגיאה ${res.status}`
    return NextResponse.json({ success: false, error: message }, { status: 200 })
  } catch {
    return NextResponse.json({ success: false, error: 'לא ניתן להתחבר ל-eBay API' }, { status: 200 })
  }
}
