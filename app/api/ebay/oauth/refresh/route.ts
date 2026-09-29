import { NextResponse } from 'next/server'
import { EbayAuthError, getConnectionStatus, getValidAccessToken } from '@/lib/ebay/auth'
import { EbayConfigError } from '@/lib/ebay/config'

// POST /api/ebay/oauth/refresh — חידוש ידני של ה-access token (כפתור "חדש Token" בהגדרות).
// קודם הקובץ הזה הכיל עותק של /api/ebay/listing; פעולות הפרסום נשארו ב-listing/route.ts.

export const dynamic = 'force-dynamic'

export async function POST(): Promise<Response> {
  try {
    await getValidAccessToken({ force: true })
    const status = await getConnectionStatus()
    return NextResponse.json({ success: true, accessExpiresAt: status.accessExpiresAt })
  } catch (err) {
    if (err instanceof EbayConfigError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof EbayAuthError) {
      return NextResponse.json({ error: err.message, needsReconnect: err.needsReconnect }, { status: 401 })
    }
    console.error('[oauth/refresh] failed:', err)
    return NextResponse.json({ error: 'שגיאה בחידוש Token' }, { status: 500 })
  }
}
