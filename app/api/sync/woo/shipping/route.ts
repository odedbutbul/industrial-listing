import { NextRequest, NextResponse } from 'next/server'
import { startRun } from '@/lib/sync/background'
import { previewWooShipping, pushWooShipping } from '@/lib/sync/woo-shipping'
import { missingWooEnv } from '@/lib/woo/config'

// מחירי משלוח מ-eBay → מוצרים שכבר בחנות. ידני בלבד.
// POST { mode: 'preview' | 'update' } → { runId } (202). ההתקדמות: GET /api/ebay/import?runId=…
// preview קורא בלבד מהחנות. update שולח רק את שדות ה-meta של המשלוח.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const missing = missingWooEnv()
  if (missing.length) return NextResponse.json({ error: `החנות לא מחוברת — חסרים בשרת: ${missing.join(', ')}` }, { status: 400 })
  const body = await request.json().catch(() => ({}))
  const update = body.mode === 'update'
  const { run, started } = startRun(update ? 'woo-shipping' : 'woo-shipping-preview', (onProgress) => (update ? pushWooShipping(onProgress) : previewWooShipping(onProgress)))
  return NextResponse.json(started ? { runId: run.id } : { runId: run.id, error: 'כבר רצה פעולה אחרת — מחכים שתסתיים', kind: run.kind }, { status: started ? 202 : 409 })
}
