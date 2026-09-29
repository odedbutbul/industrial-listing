import { NextRequest, NextResponse } from 'next/server'
import { listProducts, type ProductFilter } from '@/lib/sync/queries'

export const dynamic = 'force-dynamic'

const FILTERS: ProductFilter[] = ['all', 'in_stock', 'sold_out', 'mismatch', 'no_woo']

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const f = sp.get('filter') as ProductFilter | null
  const rows = await listProducts({ q: sp.get('q') ?? undefined, filter: f && FILTERS.includes(f) ? f : 'all' })
  return NextResponse.json({ products: rows })
}
