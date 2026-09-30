import { NextResponse } from 'next/server'
import { EbayWriteBlockedError } from '@/lib/ebay/guard'
import { fetchEbayFeedback } from '@/lib/reviews/fetch'
import { JobLockedError } from '@/lib/sync/lock'

// POST /api/sync/reviews/pull — "משיכה מ-eBay" מהמסך. GetFeedback בלבד (קריאה), עד 5 דפים של 200.

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const r = await fetchEbayFeedback({ maxPages: 5 })
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof JobLockedError) return NextResponse.json({ error: 'משיכה אחרת רצה עכשיו. נסה שוב בעוד דקה' }, { status: 409 })
    if (e instanceof EbayWriteBlockedError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'המשיכה נכשלה' }, { status: 502 })
  }
}
