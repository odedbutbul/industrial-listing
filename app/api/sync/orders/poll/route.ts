import { NextResponse } from 'next/server'
import { startRun } from '@/lib/sync/background'
import { pollEbayOrders } from '@/lib/sync/ebay-orders'

// POST /api/sync/orders/poll — משיכת הזמנות מ-eBay עכשיו (ברקע). קריאה בלבד מול eBay.
// בדרך כלל רץ מ-Cron (jobs/poll-ebay-orders.ts); הכפתור במסך ההזמנות מפעיל ריצה מיידית.
// ההתקדמות: GET /api/ebay/import?runId=…

export const dynamic = 'force-dynamic'

export async function POST() {
  const { run, started } = startRun('orders-poll', (onProgress) => pollEbayOrders({ onProgress }))
  return NextResponse.json(started ? { runId: run.id } : { runId: run.id, error: 'כבר רצה פעולה אחרת — מחכים שתסתיים', kind: run.kind }, { status: started ? 202 : 409 })
}
