import { NextResponse } from 'next/server'
import { getLead, LEAD_STATUSES, updateLead, type LeadStatus } from '@/lib/leads/queries'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const lead = await getLead(params.id)
  if (!lead) return NextResponse.json({ error: 'הליד לא נמצא' }, { status: 404 })
  return NextResponse.json(lead)
}

/** { status?, note? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as { status?: unknown; note?: unknown } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  if (body.status !== undefined && !LEAD_STATUSES.includes(body.status as LeadStatus)) return NextResponse.json({ error: 'סטטוס לא מוכר' }, { status: 400 })
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return NextResponse.json({ error: 'הערה לא תקינה' }, { status: 400 })
  const lead = await updateLead(params.id, { status: body.status as LeadStatus | undefined, note: body.note as string | null | undefined })
  if (!lead) return NextResponse.json({ error: 'הליד לא נמצא' }, { status: 404 })
  return NextResponse.json(lead)
}
