'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { api } from '@/components/sync/api'
import { ACTION_LABEL, ago, dateTime, JOB_LABEL, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { LogRow } from '@/components/sync/types'
import { Badge, LoadError, Pills, useLoad } from '@/components/sync/ui'

type Status = 'all' | 'ok' | 'fail'
type Page = { rows: LogRow[]; nextBefore: number | null; jobs: string[] }

export default function LogPage() {
  return (
    <Suspense fallback={<div className="skeleton" />}>
      <Log />
    </Suspense>
  )
}

/** שורת סיכום קצרה מתוך details — בלי להציג JSON גולמי. */
function summary(r: LogRow): string {
  if (r.error) return r.error
  const d = r.details ?? {}
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
    <section className="section">
      <div>
        <h1 className="h1">לוג</h1>
        <p className="sub">{!rows ? ' ' : rows.length ? `הפעולה האחרונה ${ago(rows[0].createdAt)}` : 'אין פעולות רשומות'}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Pills
          label="סינון לפי תוצאה"
          options={[
            ['all', 'הכל'],
            ['ok', 'הצליחו'],
            ['fail', 'נכשלו'],
          ]}
          value={status}
          onChange={(v) => setParam('status', v)}
        />
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <span className="label">פעולה</span>
          <select className="input" style={{ width: 'auto', minWidth: 180 }} value={job} onChange={(e) => setParam('job', e.target.value)}>
            <option value="">כל הפעולות</option>
            {(data?.jobs ?? (job ? [job] : [])).map((j) => (
              <option key={j} value={j}>
                {JOB_LABEL[j] ?? j}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !rows ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">{status !== 'all' || job ? 'אין פעולות שמתאימות לסינון.' : 'עוד לא נרשמו פעולות סנכרון. ייבוא ראשון יופיע כאן.'}</div>
        </div>
      ) : (
        <>
          <div className="card scroll-x">
            <table className="table" style={{ minWidth: 860 }}>
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
                    <td style={{ whiteSpace: 'nowrap' }}>{dateTime(r.createdAt)}</td>
                    <td>
                      {r.action === 'qty_mismatch' ? (
                        <Badge t="warn" dot>
                          פער
                        </Badge>
                      ) : (
                        <Badge t={r.success ? 'ok' : 'bad'} dot>
                          {r.success ? 'הצליח' : 'נכשל'}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {r.productId ? (
                        <Link href={`/sync/products/${r.productId}`}>{r.productTitle ?? 'מוצר'}</Link>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: r.error ? 'var(--bad)' : 'var(--text2)', maxWidth: 360 }}>{summary(r) || '—'}</td>
                    <td>
                      <span className="mono" style={{ color: 'var(--muted)' }}>
                        {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextBefore && (
            <button type="button" className="btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <i className="ph ph-circle-notch spin" />}
              טעינת פעולות קודמות
            </button>
          )}
        </>
      )}
    </section>
  )
}
