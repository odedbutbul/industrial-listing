'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { api } from '@/components/sync/api'
import { ACTION_LABEL, ago, dateTime, JOB_LABEL, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { LogRow } from '@/components/sync/types'
import { LoadError, Pill, Seg, Spin, useLoad } from '@/components/sync/ui'

type Status = 'all' | 'ok' | 'fail'
type Page = { rows: LogRow[]; nextBefore: number | null; jobs: string[] }

export default function LogPage() {
  return (
    <Suspense fallback={<div className="ax-skel" />}>
      <Log />
    </Suspense>
  )
}

/** שורת סיכום קצרה מתוך details — בלי להציג JSON גולמי. */
function summary(r: LogRow): string {
  if (r.error) return r.error
  const d = r.details ?? {}
  if (r.action === 'run' && r.job === 'poll-ebay-orders') {
    const parts = [`${num(Number(d.orders ?? 0))} הזמנות`, `${num(Number(d.applied ?? 0))} הורידו מלאי`]
    if (d.unmapped) parts.push(`${num(Number(d.unmapped))} לבדיקה`)
    if (d.oversold) parts.push(`${num(Number(d.oversold))} מעבר למלאי`)
    return parts.join(' · ')
  }
  if (r.action === 'run') {
    const parts = [`${num(Number(d.created ?? 0))} חדשים`, `${num(Number(d.unchanged ?? 0))} קיימים`]
    if (d.skipped) parts.push(`${num(Number(d.skipped))} דולגו`)
    if (d.mismatches) parts.push(`${num(Number(d.mismatches))} פערים`)
    return parts.join(' · ')
  }
  if (r.action === 'import_item') return `SKU ${d.sku ?? '—'} · מלאי ${d.qty ?? '—'}`
  if (r.action === 'refresh' || r.action === 'connect') return d.accessExpiresAt ? `תקף עד ${dateTime(String(d.accessExpiresAt))}` : ''
  return ''
}

function Log() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const status = (['all', 'ok', 'fail'].includes(params.get('status') ?? '') ? params.get('status') : 'all') as Status
  const job = params.get('job') ?? ''
  const [more, setMore] = useState<LogRow[]>([])
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const setParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString())
    if (value && value !== 'all') sp.set(key, value)
    else sp.delete(key)
    router.replace(`${pathname}${sp.toString() ? '?' + sp.toString() : ''}`)
  }

  const url = (before?: number) => `/api/sync/log?status=${status}&job=${encodeURIComponent(job)}${before ? `&before=${before}` : ''}`
  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<Page>(url())
    setMore([])
    setNextBefore(r.nextBefore)
    return r
  }, [status, job])
  useDataChanged(reload)

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const r = await api.get<Page>(url(nextBefore))
      setMore((m) => [...m, ...r.rows])
      setNextBefore(r.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  const rows = data ? [...data.rows, ...more] : null

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">לוג</h1>
          <p className="ax-sub">{!rows ? ' ' : rows.length ? `הפעולה האחרונה ${ago(rows[0].createdAt)}` : 'אין פעולות רשומות'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Seg
          label="סינון לפי תוצאה"
          options={[
            ['all', 'הכל'],
            ['ok', 'הצליחו'],
            ['fail', 'נכשלו'],
          ]}
          value={status}
          onChange={(v) => setParam('status', v)}
        />
        <div className="ax-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <label htmlFor="log-job" className="ax-label">
            פעולה
          </label>
          <select id="log-job" className="ax-select" style={{ width: 'auto', minWidth: 180 }} value={job} onChange={(e) => setParam('job', e.target.value)}>
            <option value="">כל הפעולות</option>
            {(data?.jobs ?? (job ? [job] : [])).map((j) => (
              <option key={j} value={j}>
                {JOB_LABEL[j] ?? j}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !rows ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <div className="ax-card">
          <p className="ax-note">{status !== 'all' || job ? 'אין פעולות שמתאימות לסינון.' : 'עוד לא נרשמו פעולות סנכרון. ייבוא ראשון יופיע כאן.'}</p>
        </div>
      ) : (
        <>
          <section className="ax-card" aria-label="פעולות סנכרון">
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table" style={{ minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th>פעולה</th>
                      <th>מתי</th>
                      <th>תוצאה</th>
                      <th>מוצר</th>
                      <th>פרטים</th>
                      <th>משך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>
                            {JOB_LABEL[r.job] ?? r.job} · {ACTION_LABEL[r.action] ?? r.action}
                          </span>
                        </td>
                        <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                          {dateTime(r.createdAt)}
                        </td>
                        <td>
                          <Result r={r} />
                        </td>
                        <td>{r.productId ? <Link href={`/sync/products/${r.productId}`}>{r.productTitle ?? 'מוצר'}</Link> : <span className="ax-muted">—</span>}</td>
                        <td style={{ color: r.error ? 'var(--ax-bad)' : 'var(--ax-text2)', maxWidth: 360 }}>{summary(r) || '—'}</td>
                        <td>
                          <span className="ax-num ax-muted">{duration(r)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ax-only-mobile ax-mcards">
              {rows.map((r) => (
                <div key={r.id} className="ax-mcard" style={{ gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>
                      {JOB_LABEL[r.job] ?? r.job} · {ACTION_LABEL[r.action] ?? r.action}
                    </span>
                    <Result r={r} />
                  </div>
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    <span className="ax-num">{dateTime(r.createdAt)}</span>
                    {r.durationMs !== null && <> · <span className="ax-num">{duration(r)}</span></>}
                  </span>
                  {r.productId && <Link href={`/sync/products/${r.productId}`}>{r.productTitle ?? 'מוצר'}</Link>}
                  {summary(r) && <span style={{ fontSize: 13, color: r.error ? 'var(--ax-bad)' : 'var(--ax-text2)' }}>{summary(r)}</span>}
                </div>
              ))}
            </div>
          </section>
          {nextBefore && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת פעולות קודמות
            </button>
          )}
        </>
      )}
    </>
  )
}

function Result({ r }: { r: LogRow }) {
  return r.action === 'qty_mismatch' ? (
    <Pill t="warn" dot>
      פער
    </Pill>
  ) : (
    <Pill t={r.success ? 'ok' : 'bad'} dot>
      {r.success ? 'הצליח' : 'נכשל'}
    </Pill>
  )
}

const duration = (r: LogRow) => (r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—')
