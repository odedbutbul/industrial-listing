import { NextResponse } from 'next/server'
import { getProductDetail } from '@/lib/sync/queries'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const detail = await getProductDetail(params.id)
  if (!detail) return NextResponse.json({ error: 'המוצר לא נמצא' }, { status: 404 })
  return NextResponse.json(detail)
}
