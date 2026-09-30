import { NextResponse } from 'next/server'
import { runPriceCheck } from '@/lib/pricing/check'
import { JobLockedError } from '@/lib/sync/lock'

// POST /api/sync/pricing/check  { sku, countries? } — בדיקה עכשיו למוצר אחד.
// עד 2 קריאות ל-eBay לכל מדינה (חיפוש + המשלוח של המודעה שלנו), GET בלבד.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sku?: unknown; countries?: unknown } | null
  const sku = typeof body?.sku === 'string' ? body.sku.trim() : ''
  if (!sku) return NextResponse.json({ error: 'חסר SKU' }, { status: 400 })
  const countries = Array.isArray(body?.countries) ? body!.countries.filter((c): c is string => typeof c === 'string').slice(0, 5) : undefined
  try {
    const r = await runPriceCheck({ skus: [sku], countries })
    if (!r.products) return NextResponse.json({ error: r.skipped[0]?.reason ?? 'המוצר לא נמצא' }, { status: 422 })
    const failed = r.checks.find((c) => c.error)
    if (failed) return NextResponse.json({ error: `eBay: ${failed.error}` }, { status: 502 })
    return NextResponse.json({ ok: true, runId: r.runId, withCompetitors: r.withCompetitors })
  } catch (err) {
    if (err instanceof JobLockedError) return NextResponse.json({ error: 'בדיקת מחירים אחרת רצה עכשיו. נסה שוב בעוד דקה' }, { status: 409 })
    throw err
  }
}
