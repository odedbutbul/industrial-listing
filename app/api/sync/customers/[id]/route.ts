import { NextResponse } from 'next/server'
import { applyCustomerAction, type CustomerAction } from '@/lib/customers/actions'
import { getCustomer } from '@/lib/customers/queries'

// GET  /api/sync/customers/:id — פרטי לקוח + ההזמנות שלו
// POST /api/sync/customers/:id — { action: 'consent', note } | { action: 'unsubscribe' } | { action: 'anonymize' }

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const detail = await getCustomer(params.id)
  if (!detail) return NextResponse.json({ error: 'הלקוח לא נמצא' }, { status: 404 })
  return NextResponse.json(detail)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => null)) as CustomerAction | null
  if (!body?.action) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const r = await applyCustomerAction(params.id, body)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const detail = await getCustomer(params.id)
  return NextResponse.json(detail)
}
