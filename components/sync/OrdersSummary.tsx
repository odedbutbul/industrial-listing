'use client'

import { X } from 'lucide-react'
import { api } from './api'
import { money, num } from './format'
import { useDataChanged } from './hooks'
import { Kpi, LoadError, Seg, useLoad } from './ui'

// סיכום כספי לפי חודש במסך ההזמנות. טווח החודשים והפלטפורמה נשמרים ב-URL;
// לחיצה על חודש מסננת את רשימת ההזמנות שמתחת לחודש הזה.

type Channel = 'all' | 'ebay' | 'woo'

interface MonthRow {
  month: string
  channel: 'ebay' | 'woo'
  orders: number
  units: number
  sales: number
  items: number
  itemsMissing: number
  cancelledOrders: number
  cancelledSales: number
}

interface Summary {
  months: MonthRow[]
  first: string | null
  last: string | null
  otherCurrency: number
  timezone: string
}

type Totals = Omit<MonthRow, 'month' | 'channel'>

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/** "2026-09" → "ספטמבר 2026" */
export const monthLabel = (m: string) => `${MONTHS_HE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

const addMonths = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** כל החודשים בין first ל-last (כולל), מהחדש לישן */
const monthRange = (first: string, last: string) => {
  const out: string[] = []
  for (let m = last; m >= first && out.length < 240; m = addMonths(m, -1)) out.push(m)
  return out
}

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const zero = (): Totals => ({ orders: 0, units: 0, sales: 0, items: 0, itemsMissing: 0, cancelledOrders: 0, cancelledSales: 0 })
const add = (a: Totals, b: Totals): Totals => ({
  orders: a.orders + b.orders,
  units: a.units + b.units,
  sales: a.sales + b.sales,
  items: a.items + b.items,
  itemsMissing: a.itemsMissing + b.itemsMissing,
  cancelledOrders: a.cancelledOrders + b.cancelledOrders,
  cancelledSales: a.cancelledSales + b.cancelledSales,
})

type Period = '12m' | 'year' | 'all' | 'custom'

export function OrdersSummary({
  channel,
  from,
  to,
  month,
  setParams,
}: {
  channel: Channel
  from: string
  to: string
  month: string
  setParams: (p: Record<string, string>) => void
}) {
  // הטווח נשלף תמיד במלואו; הסינון לטווח נעשה כאן, כדי שהבוררים יכירו את כל החודשים
  const { data, error, reload } = useLoad(() => api.get<Summary>(`/api/sync/orders/summary?channel=${channel}`), [channel])
  useDataChanged(reload)

  if (error) return <LoadError error={error} retry={reload} />
  if (!data) return <div className="ax-skel" style={{ height: 260 }} aria-label="טוען סיכום כספי" />

  const now = thisMonth()
  const last = data.last && data.last > now ? data.last : now
  const first = data.first ?? now
  const all = monthRange(first < last ? first : last, last)

  // ברירת מחדל: 12 החודשים האחרונים
  const to_ = to && all.includes(to) ? to : last
  const from_ = from && all.includes(from) && from <= to_ ? from : addMonths(to_, -11) < first ? first : addMonths(to_, -11)
  const year = now.slice(0, 4)
  const period: Period =
    !from && !to ? '12m' : from_ === first && to_ === last ? 'all' : from_ === `${year}-01` && to_ === last ? 'year' : 'custom'

  const setPeriod = (p: Period) => {
    if (p === '12m') setParams({ from: '', to: '', month: '' })
    if (p === 'year') setParams({ from: `${year}-01` < first ? first : `${year}-01`, to: last, month: '' })
    if (p === 'all') setParams({ from: first, to: last, month: '' })
  }

  // חודש → סכום שתי הפלטפורמות
  const byMonth = new Map<string, Totals>()
  for (const r of data.months) byMonth.set(r.month, add(byMonth.get(r.month) ?? zero(), r))
  const shown = all.filter((m) => m >= from_ && m <= to_)
  const total = shown.reduce((acc, m) => add(acc, byMonth.get(m) ?? zero()), zero())
  const max = Math.max(1, ...shown.map((m) => byMonth.get(m)?.sales ?? 0))
  const avg = total.orders ? total.sales / total.orders : 0
  const rangeText = from_ === to_ ? monthLabel(from_) : `${monthLabel(from_)} – ${monthLabel(to_)}`
  const channelText = channel === 'ebay' ? 'eBay בלבד' : channel === 'woo' ? 'האתר בלבד' : 'eBay והאתר'

  const toggleMonth = (m: string) => {
    setParams({ month: month === m ? '' : m })
    // בחירת חודש → קופצים לרשימה המסוננת שמתחת
    if (month !== m) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.setTimeout(() => document.getElementById('order-lines')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 50)
    }
  }

  return (
    <section className="ax-card" aria-labelledby="money-h">
      <div className="ax-card-head" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 id="money-h" className="ax-h2">
            סיכום כספי לפי חודש
          </h2>
          <p className="ax-muted" style={{ fontSize: 12.5, margin: 0 }}>
            {rangeText} · {channelText} · הזמנות שבוטלו לא נספרות
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Seg
            label="טווח זמן"
            options={[
              ['12m', '12 חודשים'],
              ['year', `${year}`],
              ['all', 'הכל'],
            ]}
            value={period === 'custom' ? ('' as Period) : period}
            onChange={setPeriod}
          />
          <label htmlFor="money-from" className="ax-sr">
            מחודש
          </label>
          <select id="money-from" className="ax-select" style={{ width: 'auto' }} value={from_} onChange={(e) => setParams({ from: e.target.value, to: to_ < e.target.value ? e.target.value : to_, month: '' })}>
            {all.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <span className="ax-muted" aria-hidden="true">
            עד
          </span>
          <label htmlFor="money-to" className="ax-sr">
            עד חודש
          </label>
          <select id="money-to" className="ax-select" style={{ width: 'auto' }} value={to_} onChange={(e) => setParams({ to: e.target.value, from: from_ > e.target.value ? e.target.value : from_, month: '' })}>
            {all.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ax-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="ax-kpis">
          <Kpi label="סך המכירות" value={money(total.sales)} sub="מה שהקונים שילמו, כולל משלוח" />
          <Kpi
            label="מחיר הפריטים"
            value={money(total.items)}
            sub={total.itemsMissing ? `חסר ב-${num(total.itemsMissing)} שורות — יתמלא בבדיקה הבאה` : 'בלי משלוח ומסים'}
          />
          <Kpi label="הזמנות" value={num(total.orders)} sub={`${num(total.units)} יחידות`} />
          <Kpi label="ממוצע להזמנה" value={money(Math.round(avg * 100) / 100)} sub={total.cancelledOrders ? `${num(total.cancelledOrders)} בוטלו (${money(total.cancelledSales)})` : 'אין ביטולים'} />
        </div>

        {total.orders === 0 && total.cancelledOrders === 0 ? (
          <p className="ax-note">אין הזמנות בטווח הזה. אפשר להרחיב את הטווח למעלה.</p>
        ) : (
          <>
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table">
                  <caption className="ax-sr">סיכום כספי לפי חודש, {rangeText}. לחיצה על חודש מסננת את רשימת ההזמנות.</caption>
                  <thead>
                    <tr>
                      <th scope="col">חודש</th>
                      <th scope="col">הזמנות</th>
                      <th scope="col">יחידות</th>
                      <th scope="col">סך המכירות</th>
                      <th scope="col" style={{ width: '30%' }}>
                        <span className="ax-sr">חלק יחסי</span>
                      </th>
                      <th scope="col">מחיר הפריטים</th>
                      <th scope="col">בוטלו</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((m) => {
                      const t = byMonth.get(m) ?? zero()
                      return (
                        <tr key={m} aria-current={month === m ? 'true' : undefined} style={month === m ? { background: 'var(--ax-tint)' } : undefined}>
                          <td>
                            <MonthButton m={m} active={month === m} disabled={!t.orders && !t.cancelledOrders} onClick={() => toggleMonth(m)} />
                          </td>
                          <td className="ax-num">{num(t.orders)}</td>
                          <td className="ax-num">{num(t.units)}</td>
                          <td className="ax-num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {money(t.sales)}
                          </td>
                          <td style={{ minWidth: 140 }}>
                            <div className="ax-bar" role="presentation">
                              <span style={{ width: `${(t.sales / max) * 100}%` }} />
                            </div>
                          </td>
                          <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                            {money(t.items)}
                          </td>
                          <td className="ax-muted" style={{ whiteSpace: 'nowrap' }}>
                            {t.cancelledOrders ? <Cancelled n={t.cancelledOrders} sum={t.cancelledSales} /> : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot style={{ fontWeight: 600 }}>
                    <tr style={{ boxShadow: 'inset 0 1px 0 var(--ax-line)' }}>
                      <td>סה״כ</td>
                      <td className="ax-num" style={{ fontWeight: 600 }}>
                        {num(total.orders)}
                      </td>
                      <td className="ax-num" style={{ fontWeight: 600 }}>
                        {num(total.units)}
                      </td>
                      <td className="ax-num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {money(total.sales)}
                      </td>
                      <td />
                      <td className="ax-num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {money(total.items)}
                      </td>
                      <td className="ax-muted" style={{ whiteSpace: 'nowrap' }}>
                        {total.cancelledOrders ? <Cancelled n={total.cancelledOrders} sum={total.cancelledSales} /> : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="ax-only-mobile ax-mcards">
              {shown.map((m) => {
                const t = byMonth.get(m) ?? zero()
                return (
                  <div key={m} className="ax-mcard" style={{ gap: 8, ...(month === m ? { background: 'var(--ax-tint)' } : {}) }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <MonthButton m={m} active={month === m} disabled={!t.orders && !t.cancelledOrders} onClick={() => toggleMonth(m)} />
                      <span className="ax-num" style={{ fontWeight: 600 }}>
                        {money(t.sales)}
                      </span>
                    </div>
                    <div className="ax-bar" role="presentation">
                      <span style={{ width: `${(t.sales / max) * 100}%` }} />
                    </div>
                    <span className="ax-muted" style={{ fontSize: 12.5 }}>
                      <span className="ax-num">{num(t.orders)}</span> הזמנות · <span className="ax-num">{num(t.units)}</span> יחידות · פריטים <span className="ax-num">{money(t.items)}</span>
                      {t.cancelledOrders ? (
                        <>
                          {' '}
                          · בוטלו <span className="ax-num">{num(t.cancelledOrders)}</span>
                        </>
                      ) : null}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {data.otherCurrency > 0 && (
          <p className="ax-note" role="note">
            {num(data.otherCurrency)} שורות הזמנה במטבע שאינו דולר לא נכללות בסכומים.
          </p>
        )}
      </div>
    </section>
  )
}

function Cancelled({ n, sum }: { n: number; sum: number }) {
  return (
    <>
      <span className="ax-num">{money(sum)}</span> <span style={{ fontSize: 12 }}>({num(n)} {n === 1 ? 'הזמנה' : 'הזמנות'})</span>
    </>
  )
}

function MonthButton({ m, active, disabled, onClick }: { m: string; active: boolean; disabled: boolean; onClick: () => void }) {
  if (disabled) return <span className="ax-muted">{monthLabel(m)}</span>
  return (
    <button
      type="button"
      className="ax-btn is-link"
      style={{ padding: 0, minHeight: 44, fontWeight: 600 }}
      aria-pressed={active}
      aria-label={active ? `ביטול הסינון לפי ${monthLabel(m)}` : `הצגת ההזמנות של ${monthLabel(m)}`}
      onClick={onClick}
    >
      {monthLabel(m)}
      {active && <X size={14} aria-hidden="true" />}
    </button>
  )
}

/** תג מעל הרשימה כשהיא מסוננת לחודש */
export function MonthFilterChip({ month, clear }: { month: string; clear: () => void }) {
  return (
    <button type="button" className="ax-btn is-sm" onClick={clear} aria-label={`ביטול הסינון לפי ${monthLabel(month)}`}>
      {monthLabel(month)}
      <X size={14} aria-hidden="true" />
    </button>
  )
}
