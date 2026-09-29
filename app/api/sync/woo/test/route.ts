import { NextResponse } from 'next/server'
import { missingWooEnv } from '@/lib/woo/config'
import { testWooConnection } from '@/lib/woo/connection'

// POST /api/sync/woo/test — בדיקת חיבור לחנות (קריאות GET בלבד). נרשם ב-sync_log.

export const dynamic = 'force-dynamic'

export async function POST(): Promise<Response> {
  const missingEnv = missingWooEnv()
  if (missingEnv.length) return NextResponse.json({ error: `חסרים בשרת: ${missingEnv.join(', ')}` }, { status: 400 })
  return NextResponse.json(await testWooConnection())
}
