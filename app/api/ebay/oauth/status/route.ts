import { NextResponse } from 'next/server'
import { getConnectionStatus } from '@/lib/ebay/auth'
import { missingEbayEnv } from '@/lib/ebay/config'

// GET /api/ebay/oauth/status — מצב החיבור ל-eBay לתצוגה. לא מחזיר טוקנים או סודות.

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const missingEnv = missingEbayEnv()
  if (missingEnv.length) {
    return NextResponse.json({ configured: false, missingEnv, connected: false })
  }
  const status = await getConnectionStatus()
  return NextResponse.json({ configured: true, missingEnv: [], ...status })
}
