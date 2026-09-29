import { NextResponse } from 'next/server'
import { fetchAnalytics } from '@/lib/analytics/fetch'
import { startRun } from '@/lib/sync/background'

// POST /api/sync/analytics/fetch — משיכת נתוני אנליטיקס עכשיו (ברקע). קריאה בלבד מגוגל ומהחנות.
// בדרך כלל רץ מ-Cron יומי (jobs/fetch-analytics.ts). ההתקדמות: GET /api/ebay/import?runId=…

export const dynamic = 'force-dynamic'

export async function POST() {
  const { run, started } = startRun('analytics-fetch', (onProgress) => fetchAnalytics({ onProgress }))
  return NextResponse.json(started ? { runId: run.id } : { runId: run.id, error: 'כבר רצה פעולה אחרת — מחכים שתסתיים', kind: run.kind }, { status: started ? 202 : 409 })
}
