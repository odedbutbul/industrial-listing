import { NextRequest, NextResponse } from 'next/server'
import { listReviews, REVIEW_FILTERS, type ReviewFilter } from '@/lib/reviews/queries'

// GET /api/sync/reviews?filter=shown|suggested|positive|neutral|negative|all &offset=

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const f = sp.get('filter') as ReviewFilter
  const filter: ReviewFilter = REVIEW_FILTERS.includes(f) ? f : 'suggested'
  return NextResponse.json(await listReviews({ filter, offset: Number(sp.get('offset')) || 0 }))
}
