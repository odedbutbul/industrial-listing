import { NextRequest, NextResponse } from 'next/server'
import { ordersMonthlySummary, type OrderChannelFilter } from '@/lib/sync/queries'

// GET /api/sync/orders/summary — סיכום כספי לפי חודש (קריאה מ-Postgres בלבד)
// ?channel=all|ebay|woo &from=YYYY-MM &to=YYYY-MM

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const channel = (['all', 'ebay', 'woo'].includes(sp.get('channel') ?? '') ? sp.get('channel') : 'all') as OrderChannelFilter
  return NextResponse.json(await ordersMonthlySummary({ channel, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined }))
}
