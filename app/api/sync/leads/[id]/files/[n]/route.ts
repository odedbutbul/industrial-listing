import { NextResponse } from 'next/server'
import { getLead } from '@/lib/leads/queries'
import { LeadsConfigError } from '@/lib/leads/signature'
import { wpLeadsGet } from '@/lib/leads/wp'

// GET /api/sync/leads/:id/files/:n — קובץ שצורף לבקשה. הקובץ נשאר באתר מחוץ לתיקייה הציבורית;
// המערכת מביאה אותו בבקשה חתומה ומעבירה למנהל המחובר. אין קישור ציבורי לקובץ.

export const dynamic = 'force-dynamic'

const INLINE = new Set(['image/jpeg', 'image/png', 'application/pdf'])

export async function GET(_: Request, { params }: { params: { id: string; n: string } }) {
  const lead = await getLead(params.id)
  const n = Number(params.n)
  const file = lead?.files.find((f) => f.n === n)
  if (!lead || !file) return NextResponse.json({ error: 'הקובץ לא נמצא' }, { status: 404 })
  let res: Response
  try {
    res = await wpLeadsGet(`/vz/v1/leads/${lead.wpId}/files/${n}`, { timeoutMs: 60_000 })
  } catch (e) {
    const msg = e instanceof LeadsConfigError ? e.message : 'האתר לא ענה. נסה שוב בעוד דקה'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
  if (!res.ok || !res.body) return NextResponse.json({ error: `האתר החזיר ${res.status}` }, { status: 502 })
  const type = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim()
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_')
  return new Response(res.body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `${INLINE.has(type) ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, no-store',
    },
  })
}
