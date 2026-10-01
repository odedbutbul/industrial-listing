import { NextRequest, NextResponse } from 'next/server'
import { loadManualProduct, ManualProductError, updateManualProduct } from '@/lib/products/manual'
import { parseManualInput } from '@/lib/products/parse'

// GET — מוצר ידני בצורת הטופס. POST { product, expectedAvailable } — עדכון במערכת (לא בחנות).

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const data = await loadManualProduct(params.id)
  if (!data) return NextResponse.json({ error: 'המוצר לא נמצא, או שהוא לא מוצר ידני' }, { status: 404 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null)
  const input = parseManualInput(body?.product)
  const expected = Number(body?.expectedAvailable)
  if (!input || !Number.isInteger(expected)) return NextResponse.json({ error: 'הנתונים שנשלחו לא תקינים' }, { status: 400 })
  try {
    await updateManualProduct(params.id, input, expected)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ManualProductError) return NextResponse.json({ error: e.message, fields: e.fields }, { status: e.status })
    throw e
  }
}
