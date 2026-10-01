import { NextResponse } from 'next/server'
import { scanListingQuality } from '@/lib/quality/scan'
import { JobLockedError } from '@/lib/sync/lock'

// POST /api/sync/quality/scan — "סריקה עכשיו". קורא רק מה-DB, בלי שום קריאה ל-eBay.

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    return NextResponse.json(await scanListingQuality())
  } catch (e) {
    if (e instanceof JobLockedError) return NextResponse.json({ error: 'סריקה אחרת רצה עכשיו. נסה שוב בעוד דקה' }, { status: 409 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'הסריקה נכשלה' }, { status: 500 })
  }
}
