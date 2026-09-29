'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, FileText, Mail } from 'lucide-react'
import { api } from '@/components/sync/api'
import { ago, bytes, dateTime, LEAD_KIND, LEAD_STATUS, num } from '@/components/sync/format'
import type { LeadDetail, LeadStatus } from '@/components/sync/types'
import { Field, LoadError, Pill, Spin, useFieldStatus, useLoad, useToast } from '@/components/sync/ui'

const STATUS_ORDER: LeadStatus[] = ['new', 'in_progress', 'quoted', 'won', 'lost']

export default function LeadPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useLoad(() => api.get<LeadDetail>(`/api/sync/leads/${id}`), [id])

  const back = (
    <Link href="/sync/leads" className="ax-back">
      <ArrowRight size={16} aria-hidden="true" />
      לידים
    </Link>
  )

  if (error)
    return (
      <>
        {back}
        <LoadError error={error} retry={reload} />
      </>
    )
  if (!data)
    return (
      <>
        {back}
        <div className="ax-skel" style={{ height: 60 }} />
        <div className="ax-skel" style={{ height: 260 }} />
      </>
    )

  const l = data
  const title = l.kind === 'rfq' ? l.part ?? 'בקשה לפי תמונה' : `הודעה מ-${l.name ?? l.email}`
  const subject = `Re: ${l.ref}${l.part ? ` — ${l.part}` : ''}`
  const mailto = `mailto:${l.email}?subject=${encodeURIComponent(subject)}`
  const kv = (label: string, value: React.ReactNode, ltr = false) =>
    value === null || value === undefined || value === '' ? null : (
      <div className="ax-kv">
        <span>{label}</span>
        <span className={ltr ? 'ax-ltr' : undefined}>{value}</span>
      </div>
    )

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {back}
        <div className="ax-page-head">
          <div>
            <h1 className="ax-h1">
              <bdi>{title}</bdi>
            </h1>
            <p className="ax-sub">
              <span className="ax-num ax-ltr">{l.ref}</span> · {LEAD_KIND[l.kind]}
              {l.short ? ' (טופס קצר)' : ''} · התקבל {ago(l.submittedAt)}
            </p>
          </div>
          <a className="ax-btn is-primary" href={mailto}>
            <Mail size={18} aria-hidden="true" />
            תשובה במייל
          </a>
        </div>
      </div>

      <div className="ax-grid-auto">
        <div className="ax-card">
          <div className="ax-card-head">
            <h2 className="ax-h2">{l.kind === 'rfq' ? 'הבקשה' : 'ההודעה'}</h2>
            <Pill t={LEAD_STATUS[l.status][1]} dot>
              {LEAD_STATUS[l.status][0]}
            </Pill>
          </div>
          {kv('מק״ט', l.part && <span className="ax-num">{l.part}</span>, true)}
          {kv('יצרן', l.maker, true)}
          {kv('כמות', l.qty !== null ? <span className="ax-num">{num(l.qty)}</span> : null)}
          {kv('מצב נדרש', l.condition, true)}
          {kv('נדרש עד', l.neededBy && <span className="ax-num">{l.neededBy}</span>)}
          {kv('מספר הזמנה', l.orderRef && <span className="ax-num">{l.orderRef}</span>, true)}
          {kv(
            'נשלח מהעמוד',
            l.sourceUrl && (
              <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="פתיחת העמוד שממנו נשלח הליד בלשונית חדשה">
                {pathOf(l.sourceUrl)} <ExternalLink size={14} aria-hidden="true" style={{ verticalAlign: -2 }} />
              </a>
            ),
            true,
          )}
          {kv('התקבל', <span className="ax-num">{dateTime(l.submittedAt)}</span>)}
          {l.message && (
            <div style={{ padding: '14px 20px 18px' }}>
              <div className="ax-inner" dir="auto" style={{ padding: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {l.message}
              </div>
            </div>
          )}
        </div>

        <div className="ax-card">
          <div className="ax-card-head">
            <h2 className="ax-h2">הפונה</h2>
          </div>
          {kv('שם', l.name && <bdi>{l.name}</bdi>)}
          {kv('חברה', l.company && <bdi>{l.company}</bdi>)}
          {kv('מייל', <a href={mailto}>{l.email}</a>, true)}
          {kv('טלפון', l.phone && <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="ax-num">{l.phone}</a>, true)}
          {kv('מדינה', l.countryName ?? l.country, true)}
        </div>

        {l.files.length > 0 && (
          <div className="ax-card">
            <div className="ax-card-head">
              <h2 className="ax-h2">קבצים מצורפים</h2>
            </div>
            <div className="ax-rows">
              {l.files.map((f) => (
                <a key={f.n} className="ax-nav-item" href={`/api/sync/leads/${l.id}/files/${f.n}`} target="_blank" rel="noopener noreferrer" aria-label={`פתיחת ${f.name} בלשונית חדשה`}>
                  <FileText size={18} aria-hidden="true" />
                  <span className="ax-ltr" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.name}
                  </span>
                  <span className="ax-num ax-muted ax-ltr">{bytes(f.size)}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <Handling lead={l} onSaved={reload} />
      </div>
    </>
  )
}

/** סטטוס + הערה פנימית. */
function Handling({ lead, onSaved }: { lead: LeadDetail; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const saved = { status: lead.status, note: lead.note ?? '' }
  const [draft, setDraft] = useState(saved)
  const [busy, setBusy] = useState(false)
  const { status, dirty, markSaved } = useFieldStatus(draft, saved)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft({ status: lead.status, note: lead.note ?? '' }), [lead.id])

  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/api/sync/leads/${lead.id}`, draft)
      markSaved()
      await onSaved()
      toast('נשמר')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה. נסה שוב', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="ax-card ax-card-pad"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h2 className="ax-h2">טיפול</h2>
      <Field id="lead-status" label="סטטוס" status={status('status')} hint={lead.statusChangedAt ? `עודכן ${ago(lead.statusChangedAt)}` : undefined}>
        <select id="lead-status" className="ax-select" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as LeadStatus }))} aria-describedby={lead.statusChangedAt ? 'lead-status-hint' : undefined}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS[s][0]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="lead-note" label="הערה פנימית" status={status('note')} hint="לא נשלחת ללקוח. למשל: מחיר שהוצע, ספק, מה חסר.">
        <textarea id="lead-note" dir="auto" className="ax-textarea" rows={4} maxLength={4000} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} aria-describedby="lead-note-hint" />
      </Field>
      <button type="submit" className="ax-btn is-primary" style={{ alignSelf: 'flex-start' }} disabled={!dirty || busy}>
        {busy && <Spin />}
        שמירה
      </button>
    </form>
  )
}

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return decodeURIComponent(u.pathname + u.search) || '/'
  } catch {
    return url
  }
}
