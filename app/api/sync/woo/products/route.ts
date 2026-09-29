import { NextRequest, NextResponse } from 'next/server'
import { startRun } from '@/lib/sync/background'
import { MAX_SELECTION, previewWooProducts, pushWooProducts } from '@/lib/sync/woo-products'
import { missingWooEnv } from '@/lib/woo/config'

// שליחת מוצרים נבחרים לחנות — רק לפי בחירה של המשתמש.
// POST { mode: 'preview' | 'create', productIds: string[] } → { runId } (202). ההתקדמות: GET /api/ebay/import?runId=…
// preview קורא בלבד (גם מול החנות). create יוצר טיוטות ומקשר מוצרים קיימים לפי SKU.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest) {
  const missing = missingWooEnv()
  if (missing.length) return NextResponse.json({ error: `החנות לא מחוברת — חסרים בשרת: ${missing.join(', ')}` }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.productIds) ? Array.from(new Set(body.productIds.filter((x: unknown) => typeof x === 'string' && UUID.test(x)))) : []
  if (!ids.length) return NextResponse.json({ error: 'לא נבחרו מוצרים' }, { status: 400 })
  if (ids.length > MAX_SELECTION) return NextResponse.json({ error: `אפשר לשלוח עד ${MAX_SELECTION} מוצרים בכל פעם` }, { status: 400 })

  const create = body.mode === 'create'
  const { run, started } = startRun(create ? 'woo-create' : 'woo-preview', (onProgress) => (create ? pushWooProducts(ids, onProgress) : previewWooProducts(ids, onProgress)))
  return NextResponse.json(started ? { runId: run.id } : { runId: run.id, error: 'כבר רצה פעולה אחרת — מחכים שתסתיים', kind: run.kind }, { status: started ? 202 : 409 })
}
