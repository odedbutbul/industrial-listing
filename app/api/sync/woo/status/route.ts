import { NextResponse } from 'next/server'
import { missingWooEnv, wooBaseUrl } from '@/lib/woo/config'
import { lastWooTest } from '@/lib/woo/connection'

// GET /api/sync/woo/status — מצב ההגדרה + תוצאת הבדיקה האחרונה. לא פונה לחנות ולא מחזיר מפתחות.

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const missingEnv = missingWooEnv()
  return NextResponse.json({
    configured: missingEnv.length === 0,
    missingEnv,
    baseUrl: wooBaseUrl(),
    lastTest: await lastWooTest(),
  })
}
