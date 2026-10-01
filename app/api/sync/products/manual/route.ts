import { NextRequest, NextResponse } from 'next/server'
import { createManualProduct, ManualProductError } from '@/lib/products/manual'
import { parseManualInput } from '@/lib/products/parse'

// POST /api/sync/products/manual — יצירת מוצר ידני במערכת (לא נשלח לחנות כאן).

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const input = parseManualInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'הנתונים שנשלחו לא תקינים' }, { status: 400 })
  try {
    return NextResponse.json(await createManualProduct(input), { status: 201 })
  } catch (e) {
    if (e instanceof ManualProductError) return NextResponse.json({ error: e.message, fields: e.fields }, { status: e.status })
    throw e
  }
}
