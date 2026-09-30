import { NextResponse } from 'next/server'
import { listOffers } from '@/lib/pricing/queries'

// GET /api/sync/pricing/:checkId — המודעות של המתחרים בבדיקה אחת. קורא רק מ-Postgres.

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { checkId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.checkId)) return NextResponse.json({ error: 'מזהה בדיקה לא תקין' }, { status: 400 })
  return NextResponse.json({ offers: await listOffers(params.checkId) })
}
