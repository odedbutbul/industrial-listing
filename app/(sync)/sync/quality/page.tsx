'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Check, ExternalLink, RotateCcw, ScanSearch } from 'lucide-react'
import { api } from '@/components/sync/api'
import { ago, date, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import { ZoomThumb } from '@/components/sync/Lightbox'
import { CHECK_LABEL, SEVERITY } from '@/components/sync/quality'
import { EmptyState, Kpi, LoadError, Pill, Seg, Spin, useLoad, useToast } from '@/components/sync/ui'

type Check = keyof typeof CHECK_LABEL
type Filter = 'open' | 'dismissed' | 'resolved' | Check
const CHECKS = Object.keys(CHECK_LABEL) as Check[]
const FILTERS: Filter[] = ['open', ...CHECKS, 'dismissed', 'resolved']

interface Related {
  id: string
  title: string
  sku: string | null
}

interface IssueRow {
  id: string
  productId: string
  check: Check
  severity: 'high' | 'medium' | 'low'
  message: string
  details: { related?: Related[]; positions?: number[]; imageUrls?: string[]; expected?: string; found?: string; field?: string; descStart?: string }
  status: 'open' | 'dismissed' | 'resolved'
  firstSeenAt: string
  dismissedAt: string | null
  resolvedAt: string | null
  title: string
  image: string | null
  sku: string | null
  ebayItemId: string | null
}

interface IssueList {
  rows: IssueRow[]
  nextOffset: number | null
  counts: Record<Check, number> & { open: number; high: number; products: number; dismissed: number; resolved: number }
  lastScan: { scannedAt: string; products: number; found: number; created: number; resolved: number; durationMs: number } | null
}

interface ScanResult {
  products: number
  found: number
  created: number
  resolved: number
}

export default function QualityPage() {
  return (
    <Suspense fallback={<div className="ax-skel" />}>
      <Quality />
    </Suspense>
  )
}

function Quality() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const filter = (FILTERS.includes(params.get('filter') as Filter) ? params.get('filter') : 'open') as Filter
  const [more, setMore] = useState<IssueRow[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [scanning, setScanning] = useState(false)
  /** ממצאים שטופלו במסך הזה — יורדים מהרשימה עד הטעינה הבאה */
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const setFilter = (v: Filter) => {
    const sp = new URLSearchParams(params.toString())
    if (v !== 'open') sp.set('filter', v)
    else sp.delete('filter')
    router.replace(`${pathname}${sp.toString() ? '?' + sp.toString() : ''}`)
  }

  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<IssueList>(`/api/sync/quality?filter=${filter}`)
    setMore([])
    setDone({})
    setNextOffset(r.nextOffset)
    return r
  }, [filter])
  useDataChanged(reload)

  const loadMore = async () => {
    if (nextOffset === null) return
    setLoadingMore(true)
    try {
      const r = await api.get<IssueList>(`/api/sync/quality?filter=${filter}&offset=${nextOffset}`)
      setMore((m) => [...m, ...r.rows])
      setNextOffset(r.nextOffset)
    } finally {
      setLoadingMore(false)
    }
  }

  const scan = async () => {
    setScanning(true)
    try {
      const r = await api.post<ScanResult>('/api/sync/quality/scan')
      toast(`נסרקו ${num(r.products)} מוצרים · ${r.created ? `${num(r.created)} ממצאים חדשים` : 'אין ממצאים חדשים'}${r.resolved ? ` · ${num(r.resolved)} תוקנו` : ''}`)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הסריקה נכשלה', 'bad')
    } finally {
      setScanning(false)
    }
  }

  const setStatus = async (r: IssueRow, action: 'dismiss' | 'reopen') => {
    setSaving(r.id)
    try {
      await api.post(`/api/sync/quality/${r.id}`, { action })
      setDone((d) => ({ ...d, [r.id]: true }))
      toast(action === 'dismiss' ? 'סומן כתקין. הממצא לא יחזור בסריקות הבאות' : 'הממצא חזר לרשימה')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'bad')
    } finally {
      setSaving(null)
    }
  }

  const rows = data ? [...data.rows, ...more].filter((r) => !done[r.id]) : null
  const c = data?.counts
  const scanned = data?.lastScan
  const sub = !data
    ? ' '
    : !scanned
      ? 'עוד לא נסרקו המודעות'
      : c!.open === 0
        ? `הכל תואם. אין ממצאים פתוחים · נסרק ${ago(scanned.scannedAt)}`
        : `${num(c!.products)} מודעות לבדיקה${c!.high ? `, ${num(c!.high)} מהן חמורות` : ''} · נסרק ${ago(scanned.scannedAt)}`

  const scanButton = (
    <button type="button" className="ax-btn is-primary" onClick={scan} disabled={scanning}>
      {scanning ? <Spin /> : <ScanSearch size={18} aria-hidden="true" />}
      סריקה עכשיו
    </button>
  )

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">בדיקת מודעות</h1>
          <p className="ax-sub">{sub}</p>
        </div>
        {scanButton}
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !data ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : !scanned ? (
        <EmptyState
          icon={ScanSearch}
          title="עוד לא נסרקו המודעות"
          text="הסריקה עוברת על כל המוצרים שיובאו מ-eBay ומחפשת מודעות שהועתקו ממודעה אחרת ולא עודכנו: תמונות של מוצר אחר, כותרת שלא תואמת לתיאור ולפרטים, דגם שכמעט זהה. היא קוראת רק את הנתונים שכבר במערכת ולא משנה דבר ב-eBay."
          action={scanButton}
        />
      ) : (
        <>
          <div className="ax-kpis">
            <Kpi label="מודעות לבדיקה" value={num(c!.products)} sub={`${num(c!.open)} ממצאים מתוך ${num(scanned.products)} מודעות`} critical={c!.high > 0} />
            <Kpi label="חמורים" value={num(c!.high)} sub="כותרת לא תואמת לתוכן, או תמונות של מוצר אחר" />
            <Kpi label="סומנו כתקינים" value={num(c!.dismissed)} sub="לא יחזרו בסריקות הבאות" />
            <Kpi label="תוקנו" value={num(c!.resolved)} sub="לא נמצאו בסריקה האחרונה" />
          </div>

          <Seg
            label="סינון ממצאים"
            options={[
              ['open', 'כל הפתוחים', c!.open],
              ...CHECKS.filter((k) => c![k] > 0 || filter === k).map((k): [Filter, string, number] => [k, CHECK_LABEL[k], c![k]]),
              ['dismissed', 'סומנו כתקינים', c!.dismissed],
              ['resolved', 'תוקנו', c!.resolved],
            ]}
            value={filter}
            onChange={setFilter}
          />

          {rows!.length === 0 ? (
            <div className="ax-card">
              <p className="ax-note">
                {filter === 'dismissed' ? 'אף ממצא לא סומן כתקין.' : filter === 'resolved' ? 'עוד אין ממצאים שתוקנו. אחרי תיקון ב-eBay, ייבוא הפרטים מחדש וסריקה — הממצא יעבור לכאן.' : 'אין ממצאים פתוחים בסינון הזה.'}
              </p>
            </div>
          ) : (
            <section className="ax-card" aria-label="ממצאים">
              <div className="ax-only-desktop">
                <div className="ax-table-wrap">
                  <table className="ax-table" style={{ minWidth: 680 }}>
                    <thead>
                      <tr>
                        <th>מוצר</th>
                        <th>מה לא תואם</th>
                        <th>
                          <span className="ax-sr">פעולות</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows!.map((r) => (
                        <tr key={r.id}>
                          <td style={{ width: '34%', verticalAlign: 'top' }}>
                            <ProductCell r={r} />
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <IssueCell r={r} />
                          </td>
                          <td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            <Actions r={r} busy={saving === r.id} onStatus={setStatus} stack />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ax-only-mobile ax-mcards">
                {rows!.map((r) => (
                  <div key={r.id} className="ax-mcard" style={{ gap: 12 }}>
                    <ProductCell r={r} />
                    <IssueCell r={r} />
                    <Actions r={r} busy={saving === r.id} onStatus={setStatus} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {nextOffset !== null && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת ממצאים נוספים
            </button>
          )}
          <p className="ax-muted" style={{ margin: 0, fontSize: 12.5 }}>
            הסריקה קוראת רק את הנתונים שכבר במערכת ולא משנה דבר ב-eBay. את התיקון עושים במודעה ב-eBay; אחרי ייבוא הפרטים מחדש וסריקה, הממצא יעבור ל&quot;תוקנו&quot;.
          </p>
        </>
      )}
    </>
  )
}

function ProductCell({ r }: { r: IssueRow }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
      {r.image ? <ZoomThumb images={[r.image]} title={r.title} size={56} alt={`התמונה הראשונה של ${r.title}`} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, fontSize: 13.5 }}>
        <Link href={`/sync/products/${r.productId}`}>
          <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
            {r.title}
          </span>
        </Link>
        {r.sku && (
          <span className="ax-muted" style={{ fontSize: 12.5 }}>
            מק״ט <span className="ax-num ax-ltr">{r.sku}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function IssueCell({ r }: { r: IssueRow }) {
  const [label, tone] = SEVERITY[r.severity]
  const d = r.details
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Pill t={tone} dot>
          {label}
        </Pill>
        <span className="ax-muted" style={{ fontSize: 12.5 }}>
          {CHECK_LABEL[r.check] ?? r.check}
        </span>
      </div>
      <span style={{ fontSize: 13.5 }}>{r.message}</span>

      {d.descStart && (
        <div className="ax-inner" style={{ padding: '8px 12px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="ax-muted">תחילת התיאור</span>
          <span dir="ltr" lang="en" style={{ textAlign: 'left' }}>
            {d.descStart}
            {d.descStart.length >= 160 ? '…' : ''}
          </span>
        </div>
      )}

      {d.imageUrls && d.imageUrls.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="התמונות המשותפות">
          {d.imageUrls.slice(0, 6).map((u, i) => (
            <ZoomThumb key={u} images={d.imageUrls!} index={i} title={r.title} size={44} alt={`תמונה ${d.positions?.[i] ?? i + 1} המשותפת`} />
          ))}
        </div>
      )}

      {d.related && d.related.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5 }}>
          <span className="ax-muted">{r.check === 'shared_image' ? 'אותן תמונות גם ב:' : 'קשור ל:'}</span>
          {d.related.slice(0, 4).map((o) => (
            <Link key={o.id} href={`/sync/products/${o.id}`}>
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                {o.title}
              </span>
              {o.sku && (
                <span className="ax-muted">
                  {' '}
                  · <span className="ax-num ax-ltr">{o.sku}</span>
                </span>
              )}
            </Link>
          ))}
          {d.related.length > 4 && <span className="ax-muted">ועוד {num(d.related.length - 4)}</span>}
        </div>
      )}

      {r.status !== 'open' && (
        <span className="ax-muted ax-num" style={{ fontSize: 12 }}>
          {r.status === 'dismissed' ? `סומן כתקין ${date(r.dismissedAt)}` : `תוקן ${date(r.resolvedAt)}`}
        </span>
      )}
    </div>
  )
}

function Actions({ r, busy, onStatus, stack }: { r: IssueRow; busy: boolean; onStatus: (r: IssueRow, a: 'dismiss' | 'reopen') => void; stack?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', alignItems: stack ? 'stretch' : 'center', flexWrap: 'wrap', gap: 8 }}>
      {r.ebayItemId && (
        <a className="ax-btn is-sm" href={`https://www.ebay.com/itm/${r.ebayItemId}`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" />
          ב-eBay<span className="ax-sr"> (נפתח בחלון חדש)</span>
        </a>
      )}
      {r.status === 'open' && (
        <button type="button" className="ax-btn is-sm" onClick={() => onStatus(r, 'dismiss')} disabled={busy}>
          {busy ? <Spin /> : <Check size={16} aria-hidden="true" />}
          בדקתי, זה בסדר
        </button>
      )}
      {r.status === 'dismissed' && (
        <button type="button" className="ax-btn is-sm" onClick={() => onStatus(r, 'reopen')} disabled={busy}>
          {busy ? <Spin /> : <RotateCcw size={16} aria-hidden="true" />}
          החזרה לרשימה
        </button>
      )}
    </div>
  )
}
