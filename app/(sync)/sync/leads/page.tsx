'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { Inbox, Paperclip, RefreshCw, Search } from 'lucide-react'
import { api } from '@/components/sync/api'
import { ago, dateTime, LEAD_KIND, LEAD_STATUS, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { LeadList, LeadRow } from '@/components/sync/types'
import { EmptyState, LoadError, Pill, Seg, Spin, useLoad, useToast } from '@/components/sync/ui'

type Status = 'open' | 'new' | 'closed' | 'all'
type Kind = 'all' | 'rfq' | 'msg'

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="ax-skel" />}>
      <Leads />
    </Suspense>
  )
}

/** מה ביקשו — שורה אחת */
function what(r: LeadRow): string {
  if (r.kind === 'msg') return r.message ? (r.message.length > 90 ? r.message.slice(0, 90) + '…' : r.message) : '—'
  const parts = [r.part ?? 'לפי תמונה', r.maker, r.qty ? `× ${num(r.qty)}` : null].filter(Boolean)
  return parts.join(' · ')
}

const who = (r: LeadRow) => [r.name, r.company, r.countryName].filter(Boolean).join(' · ') || r.email

function Leads() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const status = (['open', 'new', 'closed', 'all'].includes(params.get('status') ?? '') ? params.get('status') : 'open') as Status
  const kind = (['all', 'rfq', 'msg'].includes(params.get('kind') ?? '') ? params.get('kind') : 'all') as Kind
  const q = params.get('q') ?? ''
  const [qDraft, setQDraft] = useState(q)
  const [more, setMore] = useState<LeadRow[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pulling, setPulling] = useState(false)

  useEffect(() => setQDraft(q), [q])

  const setParam = (key: string, value: string, fallback: string) => {
    const sp = new URLSearchParams(params.toString())
    if (value && value !== fallback) sp.set(key, value)
    else sp.delete(key)
    router.replace(`${pathname}${sp.toString() ? '?' + sp.toString() : ''}`)
  }

  const url = (before?: string) => `/api/sync/leads?status=${status}&kind=${kind}&q=${encodeURIComponent(q)}${before ? `&before=${encodeURIComponent(before)}` : ''}`
  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<LeadList>(url())
    setMore([])
    setNextBefore(r.nextBefore)
    return r
  }, [status, kind, q])
  useDataChanged(reload)

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const r = await api.get<LeadList>(url(nextBefore))
      setMore((m) => [...m, ...r.rows])
      setNextBefore(r.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  const pull = async () => {
    setPulling(true)
    try {
      const r = await api.post<{ fetched: number; created: number }>('/api/sync/leads/pull')
      toast(r.created ? `נמשכו ${num(r.created)} לידים שלא הגיעו` : 'הכל הגיע. אין לידים חסרים')
      if (r.created) void reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
    } finally {
      setPulling(false)
    }
  }

  const rows = data ? [...data.rows, ...more] : null
  const c = data?.counts
  const sub = !c ? ' ' : c.all === 0 ? 'עוד לא הגיעו לידים מהאתר' : c.new ? `${num(c.new)} חדשים מחכים לטיפול` : c.open ? `${num(c.open)} בטיפול · אין חדשים` : 'אין לידים פתוחים'

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">לידים</h1>
          <p className="ax-sub">{sub}</p>
        </div>
        <button type="button" className="ax-btn" onClick={pull} disabled={pulling}>
          {pulling ? <Spin /> : <RefreshCw size={18} aria-hidden="true" />}
          בדיקה מול האתר
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Seg
          label="סינון לפי סטטוס"
          options={[
            ['open', 'פתוחים', c?.open],
            ['new', 'חדשים', c?.new],
            ['closed', 'סגורים', c?.closed],
            ['all', 'הכל', c?.all],
          ]}
          value={status}
          onChange={(v) => setParam('status', v, 'open')}
        />
        <Seg
          label="סינון לפי סוג"
          options={[
            ['all', 'כל הסוגים'],
            ['rfq', 'בקשות חלק'],
            ['msg', 'הודעות'],
          ]}
          value={kind}
          onChange={(v) => setParam('kind', v, 'all')}
        />
        <form
          role="search"
          className="ax-search"
          style={{ flex: '1 1 220px', maxWidth: 360 }}
          onSubmit={(e) => {
            e.preventDefault()
            setParam('q', qDraft.trim(), '')
          }}
        >
          <Search size={18} aria-hidden="true" />
          <input type="search" className="ax-input" aria-label="חיפוש ליד" placeholder="מספר, מייל, שם, חברה או מק״ט" value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
        </form>
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !rows ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        c?.all === 0 && !q ? (
          <EmptyState icon={Inbox} title="עוד אין לידים" text="כל בקשת חלק או הודעה מטופס צור קשר באתר תופיע כאן תוך שניות מרגע השליחה." action={
            <button type="button" className="ax-btn" onClick={pull} disabled={pulling}>
              {pulling && <Spin />}
              בדיקה מול האתר
            </button>
          } />
        ) : (
          <div className="ax-card">
            <p className="ax-note">אין לידים שמתאימים לסינון.</p>
          </div>
        )
      ) : (
        <>
          <section className="ax-card" aria-label="לידים">
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>מספר</th>
                      <th>מה ביקשו</th>
                      <th>מי</th>
                      <th>סטטוס</th>
                      <th>התקבל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Link href={`/sync/leads/${r.id}`} className="ax-num ax-ltr" style={{ fontWeight: 600 }}>
                            {r.ref}
                          </Link>
                          <div className="ax-muted" style={{ fontSize: 12.5 }}>
                            {LEAD_KIND[r.kind]}
                          </div>
                        </td>
                        <td style={{ maxWidth: 300 }}>
                          <span dir={r.kind === 'rfq' ? 'ltr' : 'auto'} style={{ unicodeBidi: 'isolate' }}>
                            {what(r)}
                          </span>
                          {r.filesCount > 0 && (
                            <span className="ax-muted" style={{ fontSize: 12.5, marginInlineStart: 8, whiteSpace: 'nowrap' }}>
                              <Paperclip size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> {num(r.filesCount)}
                              <span className="ax-sr"> קבצים מצורפים</span>
                            </span>
                          )}
                        </td>
                        <td>
                          <bdi>{who(r)}</bdi>
                        </td>
                        <td>
                          <Pill t={LEAD_STATUS[r.status][1]} dot>
                            {LEAD_STATUS[r.status][0]}
                          </Pill>
                        </td>
                        <td className="ax-muted" style={{ whiteSpace: 'nowrap' }} title={dateTime(r.submittedAt)}>
                          {ago(r.submittedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ax-only-mobile ax-mcards">
              {rows.map((r) => (
                <Link key={r.id} href={`/sync/leads/${r.id}`} className="ax-mcard" style={{ gap: 8, color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <span>
                      <span className="ax-num ax-ltr" style={{ fontWeight: 600 }}>
                        {r.ref}
                      </span>
                      <span className="ax-muted" style={{ fontSize: 12.5 }}>
                        {' '}
                        · {LEAD_KIND[r.kind]}
                      </span>
                    </span>
                    <Pill t={LEAD_STATUS[r.status][1]} dot>
                      {LEAD_STATUS[r.status][0]}
                    </Pill>
                  </div>
                  <span dir={r.kind === 'rfq' ? 'ltr' : 'auto'} style={{ unicodeBidi: 'isolate', textAlign: 'right' }}>
                    {what(r)}
                  </span>
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    <bdi>{who(r)}</bdi> · {ago(r.submittedAt)}
                    {r.filesCount > 0 && <> · {num(r.filesCount)} קבצים</>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
          {nextBefore && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת לידים קודמים
            </button>
          )}
        </>
      )}
    </>
  )
}
