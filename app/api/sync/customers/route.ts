import { NextResponse } from 'next/server'
import { customersByCountry, listCustomers, type CustomerFilter } from '@/lib/customers/queries'

// GET /api/sync/customers?filter=&country=&q=&sort=&offset= — רשימת לקוחות + ספירות + פילוח לפי מדינה. קורא רק מ-Postgres.

export const dynamic = 'force-dynamic'

const FILTERS: CustomerFilter[] = ['all', 'repeat', 'marketing', 'ebay', 'woo', 'issues']

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const filter = FILTERS.includes(sp.get('filter') as CustomerFilter) ? (sp.get('filter') as CustomerFilter) : 'all'
  const sort = (['recent', 'spent', 'orders'] as const).find((s) => s === sp.get('sort')) ?? 'recent'
  const [list, countries] = await Promise.all([
    listCustomers({ filter, sort, q: sp.get('q') ?? undefined, country: sp.get('country') ?? undefined, offset: Number(sp.get('offset')) || 0 }),
    customersByCountry(),
  ])
  return NextResponse.json({ ...list, countries })
}
