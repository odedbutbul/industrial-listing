import { NextRequest, NextResponse } from 'next/server'
import { EbayAuthError } from '@/lib/ebay/auth'
import { EbayConfigError } from '@/lib/ebay/config'
import { importEbayListings } from '@/lib/sync/import-ebay'
import { JobLockedError } from '@/lib/sync/lock'

// POST /api/ebay/import — ייבוא מודעות פעילות מ-eBay ל-Postgres. קריאה בלבד מול eBay.
// body: { dryRun?: boolean, refreshExisting?: boolean, maxPages?: number }

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  try {
    const result = await importEbayListings({
      dryRun: body.dryRun === true,
      refreshExisting: body.refreshExisting === true,
      maxPages: typeof body.maxPages === 'number' ? body.maxPages : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof JobLockedError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof EbayConfigError) return NextResponse.json({ error: err.message }, { status: 400 })
    if (err instanceof EbayAuthError) return NextResponse.json({ error: err.message }, { status: 401 })
    console.error('[ebay/import] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
