import { NextRequest, NextResponse } from 'next/server'
import { NOTE_MAX, setProductNote } from '@/lib/quality/queries'

// POST /api/sync/products/:id/note  { note: string }
//  הערה פנימית למוצר (במסך בדיקת המודעות). ריקה = מחיקה. לא נשלח ל-eBay ולא לחנות.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const body = (await request.json().catch(() => null)) as { note?: unknown } | null
  if (typeof body?.note !== 'string') return NextResponse.json({ error: 'חסרה הערה' }, { status: 400 })
  if (body.note.length > NOTE_MAX) return NextResponse.json({ error: `ההערה ארוכה מדי (עד ${NOTE_MAX} תווים)` }, { status: 400 })
  const r = await setProductNote(params.id, body.note)
  if (!r) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 })
  return NextResponse.json(r)
}
