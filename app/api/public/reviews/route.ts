import { NextRequest, NextResponse } from 'next/server'
import { publicReviews } from '@/lib/reviews/queries'

// GET /api/public/reviews — ציבורי (בלי cookie), לבלוק "ביקורות מ-eBay" באתר.
// מחזיר רק ביקורות שנבחרו במסך /sync/reviews, שם קונה מוסתר, בלי מחירים ובלי מזהים פנימיים.
// ?limit= (ברירת מחדל 30, עד 50). CORS רק לדומיין החנות (WC_BASE_URL). מטמון 10 דקות.

export const dynamic = 'force-dynamic'

function storeOrigin(): string | null {
  try {
    return process.env.WC_BASE_URL ? new URL(process.env.WC_BASE_URL).origin : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = { 'Cache-Control': 'public, max-age=600' }
  const origin = storeOrigin()
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
  }
  return NextResponse.json(await publicReviews(Number(request.nextUrl.searchParams.get('limit')) || 30), { headers })
}
