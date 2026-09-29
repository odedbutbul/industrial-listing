import { NextRequest, NextResponse } from 'next/server'
import { getRun, runningRun, startRun } from '@/lib/sync/background'
import { enrichProductDetails, importEbayListings } from '@/lib/sync/import-ebay'

// ייבוא מ-eBay ברקע — קריאה בלבד מול eBay.
// POST { mode: 'preview' | 'import' | 'enrich', limit? } → { runId } (202). ריצה שכבר רצה מוחזרת במקום חדשה (409).
// GET ?runId=… → מצב הריצה והתוצאה.   GET בלי runId → הריצה שרצה עכשיו, אם יש.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'import' || body.mode === 'enrich' ? body.mode : 'preview'

  const { run, started } =
    mode === 'enrich'
      ? startRun('enrich', (onProgress) => enrichProductDetails({ limit: Number(body.limit) || 200, onProgress }))
      : startRun(mode === 'import' ? 'import' : 'import-preview', (onProgress) => importEbayListings({ dryRun: mode !== 'import', onProgress }))

  return NextResponse.json(
    started ? { runId: run.id } : { runId: run.id, error: 'כבר רצה פעולה אחרת — מחכים שתסתיים', kind: run.kind },
    { status: started ? 202 : 409 },
  )
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('runId')
  const run = id ? getRun(id) : runningRun()
  if (!run) return NextResponse.json({ error: id ? 'הריצה לא נמצאה (ייתכן שהשרת הופעל מחדש)' : null }, { status: id ? 404 : 200 })
  return NextResponse.json(run)
}
