import { NextResponse } from 'next/server'
import { refreshProduct } from '@/lib/quality/recheck'

// POST — "עדכון מ-eBay ולאתר": קורא את המודעה מ-eBay (קריאה בלבד), מעדכן את המערכת ואת המוצר בחנות (אם הוא שם).

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 })
  try {
    return NextResponse.json(await refreshProduct(params.id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'העדכון נכשל' }, { status: 500 })
  }
}
