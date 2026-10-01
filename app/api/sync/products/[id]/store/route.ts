import { NextResponse } from 'next/server'
import { JobLockedError } from '@/lib/sync/lock'
import { pushManualProduct, StorePushError } from '@/lib/woo/manual-push'

// POST — שליחת מוצר ידני לחנות: פעם ראשונה כטיוטה, אחר כך עדכון. רק בלחיצה של המשתמש.

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 })
  try {
    return NextResponse.json(await pushManualProduct(params.id))
  } catch (e) {
    if (e instanceof StorePushError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof JobLockedError) return NextResponse.json({ error: 'המוצר כבר נשלח ברגע זה — חכה שהשליחה תסתיים' }, { status: 409 })
    throw e
  }
}
