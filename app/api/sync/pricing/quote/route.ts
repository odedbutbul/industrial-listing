import { NextResponse } from 'next/server'
import { EbayApiError } from '@/lib/ebay/trading'
import { checkQuote, QuoteInputError, type QuoteCondition } from '@/lib/pricing/quote'

// POST /api/sync/pricing/quote  { mpn, brand?, condition, offer?, country? }
// בדיקת הצעת לקוח מול השוק ב-eBay — קריאת חיפוש אחת (GET). לא משנה דבר.

export const dynamic = 'force-dynamic'

const CONDITIONS: QuoteCondition[] = ['any', 'new', 'refurbished', 'used', 'parts']

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const offerRaw = b.offer === '' || b.offer == null ? null : Number(b.offer)
  try {
    const r = await checkQuote({
      mpn: typeof b.mpn === 'string' ? b.mpn : '',
      brand: typeof b.brand === 'string' ? b.brand.slice(0, 80) : null,
      condition: CONDITIONS.includes(b.condition as QuoteCondition) ? (b.condition as QuoteCondition) : 'any',
      offer: offerRaw,
      country: typeof b.country === 'string' ? b.country : 'US',
    })
    return NextResponse.json(r)
  } catch (err) {
    if (err instanceof QuoteInputError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof EbayApiError) return NextResponse.json({ error: `eBay לא ענה: ${err.message}. נסה שוב בעוד רגע` }, { status: 502 })
    throw err
  }
}
