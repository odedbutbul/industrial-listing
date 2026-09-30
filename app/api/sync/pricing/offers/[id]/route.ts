import { NextResponse } from 'next/server'
import { setOfferDecision } from '@/lib/pricing/check'

// POST /api/sync/pricing/offers/:id  { match: true | false | null }
// "זה אותו מוצר" / "לא אותו מוצר" / חזרה לכללים. מחשב מחדש את ההשוואה. בלי eBay.

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = (await req.json().catch(() => null)) as { match?: unknown } | null
  if (!Number.isInteger(id) || id <= 0 || !body || !(body.match === true || body.match === false || body.match === null)) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const r = await setOfferDecision(id, body.match)
  if (!r) return NextResponse.json({ error: 'המודעה לא נמצאה' }, { status: 404 })
  return NextResponse.json(r)
}
