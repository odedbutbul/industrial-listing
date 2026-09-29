'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import { api, ApiError } from '@/components/sync/api'
import { ago, dateTime, money, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import { MonthFilterChip, monthLabel, OrdersSummary } from '@/components/sync/OrdersSummary'
import type { BackgroundRun } from '@/components/sync/types'
import { Kpi, LoadError, Pill, Seg, Spin, useLoad, useToast, type Tone } from '@/components/sync/ui'

// הזמנות משתי הפלטפורמות — כל שורה היא מוצר שנמכר, עם הפלטפורמה שבה נמכר.
// קריאה מ-Postgres בלבד; "בדיקת הזמנות חדשות" מושכת מ-eBay (קריאה בלבד) ברקע.

type Channel = 'all' | 'ebay' | 'woo'
type State = 'all' | 'active' | 'cancelled' | 'attention'

interface OrderLine {
  id: number
  channel: 'ebay' | 'woo'
  orderId: string
  lineId: string
  placedAt: string | null
  title: string | null
  sku: string | null
  itemId: string | null
  quantity: number
  lineTotal: string | null
  currency: string | null
  lineStatus: 'applied' | 'cancelled' | 'unmapped' | 'ignored'
  note: string | null
  productId: string | null
  productTitle: string | null
  orderState: 'paid' | 'pending' | 'cancel_requested' | 'cancelled' | 'refunded' | null
  fulfillmentStatus: string | null
  customerId: string | null
  customerName: string | null
}

interface OrdersPage {
  rows: OrderLine[]
  nextBefore: string | null
  counts: { all: number; ebay: number; woo: number; attention: number; last30: number }
  lastPoll: { at: string; success: boolean; error: string | null; details: Record<string, unknown> | null } | null
  wooConnected: boolean
}

// ── טבלת סטטוסים אחת למסך ────────────────────────────────────────────────────

const CHANNEL: Record<OrderLine['channel'], [string, Tone]> = { ebay: ['eBay', 'blue'], woo: ['האתר', 'violet'] }

const ORDER_STATE: Record<NonNullable<OrderLine['orderState']>, [string, Tone]> = {
  paid: ['שולמה', 'ok'],
  pending: ['ממתינה לתשלום', 'warn'],
  cancel_requested: ['בקשת ביטול', 'warn'],
  cancelled: ['בוטלה', 'gray'],
  refunded: ['הוחזר כסף', 'gray'],
}

const STOCK: Record<OrderLine['lineStatus'], [string, Tone]> = {
  applied: ['ירד מהמלאי', 'ok'],
  cancelled: ['לא במלאי', 'gray'],
  ignored: ['היסטוריה', 'gray'],
  unmapped: ['לבדיקה', 'warn'],
}

const orderUrl = (l: OrderLine) => (l.channel === 'ebay' ? `https://www.ebay.com/sh/ord/details?orderid=${encodeURIComponent(l.orderId)}` : null)

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="ax-skel" />}>
      <Orders />
    </Suspense>
  )
}

function Orders() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const channel = (['all', 'ebay', 'woo'].includes(params.get('channel') ?? '') ? params.get('channel') : 'all') as Channel
  const state = (['all', 'active', 'cancelled', 'attention'].includes(params.get('state') ?? '') ? params.get('state') : 'all') as State
  const q = params.get('q') ?? ''
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : ''
  const [query, setQuery] = useState(q)
  const [more, setMore] = useState<OrderLine[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [polling, setPolling] = useState(false)
  const timer = useRef<number>(0)

  const setParams = useCallback(
    (values: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(values)) {
        if (value && value !== 'all') sp.set(key, value)
        else sp.delete(key)
      }
      router.replace(`${pathname}${sp.toString() ? '?' + sp.toString() : ''}`, { scroll: false })
    },
    [params, pathname, router],
  )
  const setParam = useCallback((key: string, value: string) => setParams({ [key]: value }), [setParams])

  useEffect(() => setQuery(q), [q])
  useEffect(() => {
    if (query === q) return
    const t = window.setTimeout(() => setParam('q', query.trim()), 400)
    return () => window.clearTimeout(t)
  }, [query, q, setParam])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const url = (before?: string) => `/api/sync/orders?channel=${channel}&state=${state}&q=${encodeURIComponent(q)}${month ? `&month=${month}` : ''}${before ? `&before=${encodeURIComponent(before)}` : ''}`
  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<OrdersPage>(url())
    setMore([])
    setNextBefore(r.nextBefore)
    return r
  }, [channel, state, q, month])
  useDataChanged(reload)

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const r = await api.get<OrdersPage>(url(nextBefore))
      setMore((m) => [...m, ...r.rows])
      setNextBefore(r.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  /** מושך הזמנות חדשות מ-eBay ברקע, ומחכה שהריצה תסתיים */
  const pollNow = async () => {
    setPolling(true)
    let runId: string
    try {
      runId = (await api.post<{ runId: string }>('/api/sync/orders/poll')).runId
    } catch (e) {
      setPolling(false)
      toast(e instanceof ApiError && e.status === 409 ? 'כבר רצה פעולה אחרת — נסה שוב בעוד רגע' : e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
      return
    }
    const tick = async () => {
      try {
        const r = await api.get<BackgroundRun>(`/api/ebay/import?runId=${runId}`)
        if (r.status === 'running') {
          timer.current = window.setTimeout(tick, 1500)
          return
        }
        setPolling(false)
        if (r.status === 'failed') return toast(r.error ?? 'הבדיקה נכשלה', 'bad')
        const res = r.result as { newLines: number; applied: number; unmapped: number; oversold: unknown[] }
        toast(
          res.oversold.length
            ? `נמצאה מכירה מעבר למלאי — ${res.oversold.length} מוצרים. פרטים בלוג`
            : res.newLines
              ? `נקלטו ${num(res.newLines)} שורות הזמנה חדשות${res.applied ? `, ${num(res.applied)} הורידו מלאי` : ''}`
              : 'אין הזמנות חדשות',
          res.oversold.length ? 'bad' : 'ok',
        )
        void reload()
      } catch (e) {
        setPolling(false)
        toast(e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
      }
    }
    void tick()
  }

  const rows = data ? [...data.rows, ...more] : null
  const c = data?.counts
  const filtered = channel !== 'all' || state !== 'all' || !!q || !!month
  const sub = !data
    ? ' '
    : [
        `${num(c!.last30)} מכירות ב-30 הימים האחרונים`,
        data.lastPoll ? `נבדק מול eBay ${ago(data.lastPoll.at)}` : 'עוד לא נבדק מול eBay',
      ].join(' · ')

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">הזמנות</h1>
          <p className="ax-sub">{sub}</p>
        </div>
        <button type="button" className="ax-btn" onClick={pollNow} disabled={polling}>
          {polling ? <Spin /> : <RefreshCw size={16} aria-hidden="true" />}
          {polling ? 'בודק ב-eBay…' : 'בדיקת הזמנות חדשות'}
        </button>
      </div>

      {data && (
        <div className="ax-kpis">
          <Kpi label="נמכרו ב-eBay" value={num(c!.ebay)} sub="שורות הזמנה שנקלטו" />
          <Kpi label="נמכרו באתר" value={num(c!.woo)} sub={data.wooConnected ? 'שורות הזמנה שנקלטו' : 'WooCommerce עוד לא מחובר'} />
          {c!.attention ? (
            <Kpi label="לבדיקה" value={num(c!.attention)} sub="נמכרו אחרי הייבוא, בלי מוצר מזוהה" critical />
          ) : (
            <Kpi label="לבדיקה" value="0" sub="כל המכירות מזוהות" />
          )}
        </div>
      )}

      <OrdersSummary channel={channel} from={params.get('from') ?? ''} to={params.get('to') ?? ''} month={month} setParams={setParams} />

      <div id="order-lines" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', scrollMarginTop: 88 }}>
        <Seg
          label="סינון לפי פלטפורמה"
          options={[
            ['all', 'הכל', c?.all],
            ['ebay', 'eBay', c?.ebay],
            ['woo', 'האתר', c?.woo],
          ]}
          value={channel}
          onChange={(v) => setParam('channel', v)}
        />
        <Seg
          label="סינון לפי מצב"
          options={[
            ['all', 'הכל'],
            ['active', 'פעילות'],
            ['cancelled', 'בוטלו'],
            ['attention', 'לבדיקה', c?.attention],
          ]}
          value={state}
          onChange={(v) => setParam('state', v)}
        />
        <div className="ax-search" style={{ minWidth: 220 }} role="search">
          <Search size={18} aria-hidden="true" />
          <input type="search" className="ax-input" aria-label="חיפוש הזמנה" placeholder="מוצר, SKU, מספר הזמנה או מודעה" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {month && <MonthFilterChip month={month} clear={() => setParam('month', '')} />}
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !rows ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <div className="ax-card">
          <p className="ax-note">
            {filtered ? (month ? `אין הזמנות ב${monthLabel(month)} שמתאימות לסינון.` : 'אין הזמנות שמתאימות לסינון.') : 'עוד לא נקלטו הזמנות. "בדיקת הזמנות חדשות" מושכת את ההזמנות של 30 הימים האחרונים מ-eBay.'}
          </p>
        </div>
      ) : (
        <>
          <section className="ax-card" aria-label="שורות הזמנה">
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table" style={{ minWidth: 1040 }}>
                  <thead>
                    <tr>
                      <th>מוצר</th>
                      <th>פלטפורמה</th>
                      <th>מלאי</th>
                      <th>מצב ההזמנה</th>
                      <th>מתי</th>
                      <th>כמות</th>
                      <th>סכום</th>
                      <th>הזמנה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id}>
                        <td style={{ minWidth: 240, maxWidth: 340 }}>
                          <ProductCell l={l} />
                        </td>
                        <td>
                          <Pill t={CHANNEL[l.channel][1]}>{CHANNEL[l.channel][0]}</Pill>
                        </td>
                        <td style={{ minWidth: 150 }}>
                          <StockCell l={l} />
                        </td>
                        <td>{l.orderState ? <Pill t={ORDER_STATE[l.orderState][1]}>{ORDER_STATE[l.orderState][0]}</Pill> : '—'}</td>
                        <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                          {dateTime(l.placedAt)}
                        </td>
                        <td className="ax-num">{num(l.quantity)}</td>
                        <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                          {money(l.lineTotal, l.currency ?? 'USD')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <OrderLink l={l} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ax-only-mobile ax-mcards">
              {rows.map((l) => (
                <div key={l.id} className="ax-mcard" style={{ gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <ProductCell l={l} />
                    <Pill t={CHANNEL[l.channel][1]}>{CHANNEL[l.channel][0]}</Pill>
                  </div>
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    <span className="ax-num">{dateTime(l.placedAt)}</span> · כמות <span className="ax-num">{num(l.quantity)}</span> · <span className="ax-num">{money(l.lineTotal, l.currency ?? 'USD')}</span>
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {l.orderState && <Pill t={ORDER_STATE[l.orderState][1]}>{ORDER_STATE[l.orderState][0]}</Pill>}
                    <StockCell l={l} />
                  </div>
                  <OrderLink l={l} />
                </div>
              ))}
            </div>
          </section>
          {nextBefore && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת הזמנות קודמות
            </button>
          )}
        </>
      )}
    </>
  )
}

function ProductCell({ l }: { l: OrderLine }) {
  const title = l.productTitle ?? l.title ?? 'מוצר'
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {l.productId ? (
        <Link href={`/sync/products/${l.productId}`} style={{ fontWeight: 600 }}>
          {title}
        </Link>
      ) : (
        <span style={{ fontWeight: 600 }}>{title}</span>
      )}
      <span className="ax-muted ax-num ax-ltr" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
        {l.sku ?? '—'}
      </span>
    </span>
  )
}

function OrderLink({ l }: { l: OrderLine }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <OrderNumber l={l} />
      {l.customerId && (
        <Link href={`/sync/customers/${l.customerId}`} style={{ fontSize: 12.5 }}>
          {l.customerName ?? 'לקוח'}
        </Link>
      )}
    </span>
  )
}

function OrderNumber({ l }: { l: OrderLine }) {
  const href = orderUrl(l)
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ax-num ax-ltr" aria-label={`פתיחת הזמנה ${l.orderId} ב-eBay בלשונית חדשה`}>
      {l.orderId} <ExternalLink size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />
    </a>
  ) : (
    <span className="ax-num ax-ltr">{l.orderId}</span>
  )
}

function StockCell({ l }: { l: OrderLine }) {
  const [label, tone] = STOCK[l.lineStatus]
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }} title={l.note ?? undefined}>
      <Pill t={tone} dot>
        {label}
      </Pill>
      {l.note && l.lineStatus !== 'applied' && (
        <span className="ax-muted" style={{ fontSize: 12 }}>
          {l.note}
        </span>
      )}
    </span>
  )
}
