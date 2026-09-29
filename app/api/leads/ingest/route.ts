import { NextRequest, NextResponse } from 'next/server'
import { LeadsConfigError, leadsSecret, verify } from '@/lib/leads/signature'
import { LeadPayloadError, parseLeadPayload, storeLead } from '@/lib/leads/store'
import { writeSyncLog } from '@/lib/sync/log'

// POST /api/leads/ingest — האתר שולח ליד מיד אחרי שנשמר אצלו (inc/lead-push.php).
// ציבורי ב-middleware; ההגנה היא חתימת HMAC + חלון זמן (lib/leads/signature.ts).
// 2xx = נקלט (או כבר היה) · 400 = גוף לא תקין (האתר לא ינסה שוב) · 401 = חתימה · 5xx = לנסות שוב.

export const dynamic = 'force-dynamic'

const MAX_BYTES = 64 * 1024

export async function POST(request: NextRequest) {
  let secret: string
  try {
    secret = leadsSecret()
  } catch (e) {
    if (e instanceof LeadsConfigError) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
    throw e
  }
  const body = await request.text()
  if (body.length > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 })

  const v = verify(secret, request.headers.get('x-vz-timestamp'), request.headers.get('x-vz-signature'), body)
  if (!v.ok) {
    await writeSyncLog({ job: 'leads', action: 'reject_lead', success: false, error: v.reason })
    return NextResponse.json({ error: v.reason }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }
  try {
    const { created } = await storeLead(parseLeadPayload(payload, 'push'))
    return NextResponse.json({ ok: true, created })
  } catch (e) {
    if (e instanceof LeadPayloadError) {
      await writeSyncLog({ job: 'leads', action: 'invalid_lead', success: false, error: e.message })
      return NextResponse.json({ error: 'bad_payload', message: e.message }, { status: 400 })
    }
    console.error('[leads/ingest]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
