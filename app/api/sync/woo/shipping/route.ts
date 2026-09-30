import { NextRequest, NextResponse } from 'next/server'
import { startRun } from '@/lib/sync/background'
import { fetchShippingCosts } from '@/lib/sync/shipping-costs'
import { previewWooShipping, pushWooShipping } from '@/lib/sync/woo-shipping'
import { missingWooEnv } from '@/lib/woo/config'

// מחיר ומחירי משלוח → מוצרים שכבר בחנות (הכפתור במסך המוצרים; אותו דבר רץ גם כל בוקר).
// POST { mode: 'refresh' | 'preview' | 'update' } → { runId } (202). ההתקדמות: GET /api/ebay/import?runId=…
// refresh: משיכה עכשיו מ-eBay (קריאה בלבד, ~34 קריאות) → products.price / shipping_costs. לא נוגע בחנות.
// preview קורא בלבד מהחנות. update שולח רק מחיר ו/או שדות המשלוח שהשתנו.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const missing = missingWooEnv()
  if (missing.length) return NextResponse.json({ error: `החנות לא מחוברת — חסרים בשרת: ${missing.join(', ')}` }, { status: 400 })
  const body = await request.json().catch(() => ({}))
  const { run, started } =
    body.mode === 'refresh'
      ? startRun('ebay-prices', (onProgress) => fetchShippingCosts({ onProgress }))
      : body.mode === 'update'
        ? startRun('woo-shipping', (onProgress) => pushWooShipping(onProgress))
        : startRun('woo-shipping-preview', (onProgress) => previewWooShipping(onProgress))
  return NextResponse.json(started ? { runId: run.id } : { runId: run.id, error: 'כבר רצה פעולה אחרת — מחכים שתסתיים', kind: run.kind }, { status: started ? 202 : 409 })
}
