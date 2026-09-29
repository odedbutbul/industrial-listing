import { NextResponse } from 'next/server'
import { analyticsReport, PERIODS } from '@/lib/analytics/report'

// GET /api/sync/analytics/report?days=28 — הדוח והתובנות. קורא רק מ-Postgres.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const d = Number(new URL(req.url).searchParams.get('days'))
  const days = (PERIODS as readonly number[]).includes(d) ? d : 28
  return NextResponse.json(await analyticsReport(days))
}
