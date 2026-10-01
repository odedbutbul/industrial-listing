import { NextRequest, NextResponse } from 'next/server'
import { setIssueStatus } from '@/lib/quality/queries'

// POST /api/sync/quality/:id  { action: 'dismiss' | 'reopen' } — "בדקתי, זה בסדר" / החזרה לרשימה

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null
  if (body?.action !== 'dismiss' && body?.action !== 'reopen') return NextResponse.json({ error: 'חסר action' }, { status: 400 })
  const r = await setIssueStatus(params.id, body.action)
  if (!r) return NextResponse.json({ error: 'הממצא לא נמצא או שכבר עודכן' }, { status: 404 })
  return NextResponse.json(r)
}
