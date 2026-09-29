import { NextRequest, NextResponse } from 'next/server'
import { listProducts, type ProductFilter } from '@/lib/sync/queries'

export const dynamic = 'force-dynamic'

const FILTERS: ProductFilter[] = ['all', 'in_stock', 'sold_out', 'mismatch', 'no_woo']

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const f = sp.get('filter') as ProductFilter | null
  const offset = Number(sp.get('offset')) || 0
  const page = await listProducts({ q: sp.get('q') ?? undefined, filter: f && FILTERS.includes(f) ? f : 'all', offset })
  return NextResponse.json(page)
}
