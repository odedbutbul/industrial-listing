import { NextRequest, NextResponse } from 'next/server'
import { listIssues, productIssues, QUALITY_FILTERS, type QualityFilter } from '@/lib/quality/queries'

// GET /api/sync/quality?filter=open|<check>|dismissed|resolved &offset= — ממצאי בדיקת איכות המודעות
// GET /api/sync/quality?product=<id> — הממצאים הפתוחים של מוצר אחד (לדף המוצר)

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const product = sp.get('product')
  if (product) {
    if (!/^[0-9a-f-]{36}$/i.test(product)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
    return NextResponse.json({ rows: await productIssues(product) })
  }
  const f = sp.get('filter') as QualityFilter
  const filter: QualityFilter = QUALITY_FILTERS.includes(f) ? f : 'open'
  return NextResponse.json(await listIssues({ filter, offset: Number(sp.get('offset')) || 0 }))
}
