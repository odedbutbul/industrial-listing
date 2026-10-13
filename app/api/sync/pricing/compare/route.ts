import { NextResponse } from 'next/server'
import { compareOffers, comparedOfferIds } from '@/lib/pricing/compare'

// POST /api/sync/pricing/compare  { offerIds: number[] } | { checkId }
// השוואה מעמיקה: מה שונה בין המודעה שלנו למודעת המתחרה ולמה יש פער מחיר.
// קריאת GET אחת ל-eBay לכל מודעה + Gemini (טקסט בלבד). checkId = כל המודעות שבהשוואה (עד 12).

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX = 12
/** תקרת Gemini לבקשה אחת מהמסך */
const MAX_USD = 0.1

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { offerIds?: unknown; checkId?: unknown } | null
  let ids: number[] = []
  if (typeof body?.checkId === 'string' && /^[0-9a-f-]{36}$/i.test(body.checkId)) {
    ids = await comparedOfferIds(body.checkId, MAX)
    if (!ids.length) return NextResponse.json({ error: 'אין מודעות בהשוואה בבדיקה הזו' }, { status: 422 })
  } else if (Array.isArray(body?.offerIds)) {
    ids = body!.offerIds.filter((v): v is number => Number.isInteger(v) && (v as number) > 0).slice(0, MAX)
  }
  if (!ids.length) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const r = await compareOffers(ids, { trigger: 'manual', maxUsd: MAX_USD })
  if (!r.compared) return NextResponse.json({ error: `eBay: ${r.outcomes[0]?.error ?? 'המודעה לא נמצאה'}` }, { status: 502 })
  return NextResponse.json({
    compared: r.compared,
    errors: r.errors,
    aiCostUsd: r.aiCostUsd,
    aiNote: r.aiSkipped ? 'Gemini לא מוגדר — רק הבדלים לפי כללים' : r.outcomes.find((o) => o.aiError)?.aiError ?? null,
  })
}
