import { db, schema } from '@/lib/db/client'
import { writeSyncLog } from '@/lib/sync/log'

// קליטת ליד מהאתר (push או pull) → טבלת leads. אידמפוטנטי לפי ref.

type LeadInsert = typeof schema.leads.$inferInsert

export class LeadPayloadError extends Error {}

const REF_RE = /^(RFQ|MSG)-\d{1,10}$/
const s = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = String(v).trim().slice(0, max)
  return t === '' ? null : t
}

/**
 * הצורה שהאתר שולח (vz_lead_payload ב-inc/lead-push.php, v=1):
 * { v, ref, kind, wp_id, submitted_at, data: {...שדות הטופס}, country_name, condition_label, files: [{n,name,size}] }
 */
export function parseLeadPayload(input: unknown, via: 'push' | 'pull'): LeadInsert {
  if (!input || typeof input !== 'object') throw new LeadPayloadError('גוף הבקשה אינו אובייקט')
  const p = input as Record<string, unknown>
  const ref = s(p.ref, 20)
  if (!ref || !REF_RE.test(ref)) throw new LeadPayloadError('ref חסר או לא תקין')
  const kind = p.kind === 'rfq' || p.kind === 'msg' ? p.kind : null
  if (!kind || (kind === 'rfq') !== ref.startsWith('RFQ')) throw new LeadPayloadError('kind לא תקין')
  const wpId = Number(p.wp_id)
  if (!Number.isInteger(wpId) || wpId <= 0) throw new LeadPayloadError('wp_id לא תקין')
  const submittedAt = new Date(String(p.submitted_at ?? ''))
  if (Number.isNaN(submittedAt.getTime())) throw new LeadPayloadError('submitted_at לא תקין')
  const d = (p.data && typeof p.data === 'object' ? p.data : {}) as Record<string, unknown>
  const email = s(d.email, 120)
  if (!email || !email.includes('@')) throw new LeadPayloadError('email חסר')

  const qty = Number(d.qty)
  const files = Array.isArray(p.files)
    ? p.files
        .slice(0, 10)
        .map((f) => f as Record<string, unknown>)
        .filter((f) => Number.isInteger(Number(f.n)))
        .map((f) => ({ n: Number(f.n), name: s(f.name, 200) ?? 'file', size: Math.max(0, Number(f.size) || 0) }))
    : []
  const phone = [s(d.dial, 6), s(d.phone, 30)].filter(Boolean).join(' ')

  return {
    ref,
    kind,
    wpId,
    name: s(d.name, 80),
    company: s(d.company, 120),
    email,
    phone: phone || null,
    country: s(d.country, 2),
    countryName: s(p.country_name, 80),
    part: s(d.part, 80),
    maker: s(d.maker, 80),
    qty: kind === 'rfq' && Number.isInteger(qty) && qty > 0 ? qty : null,
    condition: s(p.condition_label, 40) ?? s(d.cond, 20),
    neededBy: s(d.needed, 10),
    message: s(kind === 'rfq' ? d.notes : d.message, 4000),
    orderRef: s(d.order, 20),
    sourceUrl: s(d.source, 500),
    short: d.short === '1' || d.short === true,
    files,
    receivedVia: via,
    submittedAt,
    raw: p,
  }
}

/** שומר ליד. created=false אם כבר קיים (שליחה חוזרת / גם push וגם pull) — לא דורס סטטוס או הערה. */
export async function storeLead(row: LeadInsert): Promise<{ created: boolean; id: string | null }> {
  const inserted = await db.insert(schema.leads).values(row).onConflictDoNothing({ target: schema.leads.ref }).returning({ id: schema.leads.id })
  const created = inserted.length > 0
  if (created) {
    await writeSyncLog({ job: 'leads', action: 'receive_lead', success: true, details: { ref: row.ref, kind: row.kind, via: row.receivedVia } })
  }
  return { created, id: inserted[0]?.id ?? null }
}
