import { NextRequest, NextResponse } from 'next/server'
import { listOrderLines, type OrderChannelFilter, type OrderStateFilter } from '@/lib/sync/queries'

// GET /api/sync/orders — שורות הזמנה משני הערוצים (קריאה מ-Postgres בלבד)
// ?channel=all|ebay|woo &state=all|active|cancelled|attention &q= &before=<iso|id>

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const channel = (['all', 'ebay', 'woo'].includes(sp.get('channel') ?? '') ? sp.get('channel') : 'all') as OrderChannelFilter
  const state = (['all', 'active', 'cancelled', 'attention'].includes(sp.get('state') ?? '') ? sp.get('state') : 'all') as OrderStateFilter
  return NextResponse.json(await listOrderLines({ channel, state, q: sp.get('q') ?? undefined, before: sp.get('before') ?? undefined }))
}
