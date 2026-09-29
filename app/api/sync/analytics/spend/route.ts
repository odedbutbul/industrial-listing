import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { listSpend } from '@/lib/analytics/report'
import { db, schema } from '@/lib/db/client'

// הוצאות שיווק ידניות (לחישוב ROI / ROAS).
// GET  — הרשימה
// POST — { month: 'YYYY-MM', channel, amount, note? } → שמירה (אותו חודש + ערוץ מתעדכן) · { deleteId } → מחיקת שורה

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ rows: await listSpend() })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { month?: string; channel?: string; amount?: number | string; note?: string; deleteId?: number } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (body.deleteId !== undefined) {
    await db.delete(schema.marketingSpend).where(eq(schema.marketingSpend.id, Number(body.deleteId)))
    return NextResponse.json({ rows: await listSpend() })
  }

  const month = String(body.month ?? '')
  const channel = String(body.channel ?? '').trim().slice(0, 60)
  const amount = Number(body.amount)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'חודש לא תקין' }, { status: 400 })
  if (!channel) return NextResponse.json({ error: 'חסר שם ערוץ' }, { status: 400 })
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return NextResponse.json({ error: 'סכום לא תקין' }, { status: 400 })

  const note = body.note?.trim().slice(0, 200) || null
  await db
    .insert(schema.marketingSpend)
    .values({ month, channel, amount: amount.toFixed(2), note })
    .onConflictDoUpdate({ target: [schema.marketingSpend.month, schema.marketingSpend.channel], set: { amount: amount.toFixed(2), note, updatedAt: sql`now()` } })
  return NextResponse.json({ rows: await listSpend() })
}
