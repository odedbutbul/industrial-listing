import { NextResponse } from 'next/server'
import { testGoogleConnection } from '@/lib/analytics/connection'

// POST /api/sync/analytics/test — בדיקת חיבור ל-Search Console ול-GA4 (קריאה בלבד). נרשם ב-sync_log.

export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json(await testGoogleConnection())
}
