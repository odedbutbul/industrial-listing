import { NextResponse } from 'next/server'
import { importBlocked } from '@/lib/customers/blocked'

// POST /api/sync/customers/blocked — { text, note? }: ייבוא רשימת החסומים ב-eBay (שמות משתמש שהודבקו). רישום בלבד.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: string; note?: string } | null
  if (!body?.text?.trim()) return NextResponse.json({ error: 'לא הודבקו שמות משתמש' }, { status: 400 })
  if (body.text.length > 200_000) return NextResponse.json({ error: 'הרשימה ארוכה מדי' }, { status: 400 })
  return NextResponse.json(await importBlocked(body.text, body.note))
}
