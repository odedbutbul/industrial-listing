import { NextResponse } from 'next/server'
import { listPrices, type PriceFilter } from '@/lib/pricing/queries'

// GET /api/sync/pricing?filter=&country= — הבדיקה האחרונה לכל מוצר מול המתחרים ב-eBay. קורא רק מ-Postgres.

export const dynamic = 'force-dynamic'

const FILTERS: PriceFilter[] = ['all', 'expensive', 'market', 'cheap', 'none']

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const filter = FILTERS.includes(sp.get('filter') as PriceFilter) ? (sp.get('filter') as PriceFilter) : 'all'
  const country = /^[A-Z]{2}$/.test(sp.get('country') ?? '') ? sp.get('country')! : undefined
  return NextResponse.json(await listPrices({ filter, country }))
}
