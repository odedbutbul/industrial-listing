import { NextRequest, NextResponse } from 'next/server'
import { ReviewNotAllowedError, setShowOnSite } from '@/lib/reviews/queries'

// POST /api/sync/reviews/:id  { show: boolean } — בחירה ידנית אם הביקורת מוצגת באתר

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const body = (await request.json().catch(() => null)) as { show?: unknown } | null
  if (typeof body?.show !== 'boolean') return NextResponse.json({ error: 'חסר show' }, { status: 400 })
  try {
    const r = await setShowOnSite(params.id, body.show)
    if (!r) return NextResponse.json({ error: 'הביקורת לא נמצאה' }, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof ReviewNotAllowedError) return NextResponse.json({ error: e.message }, { status: 422 })
    throw e
  }
}
