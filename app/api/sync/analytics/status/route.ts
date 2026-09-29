import { NextResponse } from 'next/server'
import { lastAnalyticsFetch, lastGoogleTest } from '@/lib/analytics/connection'
import { googleEnvStatus } from '@/lib/google/config'

// GET /api/sync/analytics/status — מצב ההגדרה של גוגל + בדיקה ומשיכה אחרונות. לא פונה לגוגל ולא מחזיר מפתחות.

export const dynamic = 'force-dynamic'

export async function GET() {
  const env = googleEnvStatus()
  return NextResponse.json({ ...env, lastTest: await lastGoogleTest(), lastFetch: await lastAnalyticsFetch() })
}
