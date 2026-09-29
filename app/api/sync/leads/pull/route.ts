import { NextResponse } from 'next/server'
import { pullLeads } from '@/lib/leads/pull'
import { LeadsConfigError } from '@/lib/leads/signature'
import { JobLockedError } from '@/lib/sync/lock'

// POST /api/sync/leads/pull — "בדיקה מול האתר" מהמסך: אותה משיכה שה-cron מריץ.

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    return NextResponse.json(await pullLeads())
  } catch (e) {
    if (e instanceof JobLockedError) return NextResponse.json({ error: 'משיכה אחרת רצה עכשיו. נסה שוב בעוד דקה' }, { status: 409 })
    if (e instanceof LeadsConfigError) return NextResponse.json({ error: e.message }, { status: 503 })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'המשיכה נכשלה' }, { status: 502 })
  }
}
