'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { Globe2, Search, Users, X } from 'lucide-react'
import type { CountryStat, CustomerRow } from '@/lib/customers/queries'
import { api } from '@/components/sync/api'
import { ConductBadge } from '@/components/sync/ConductBadge'
import { CHANNEL_LABEL, countryName, MARKETING } from '@/components/sync/customers'
import { date, money, num, pct } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import { EmptyState, Kpi, LoadError, Pill, Seg, Spin, useLoad } from '@/components/sync/ui'

// מאגר הלקוחות: כל לקוח נוצר מהזמנה (eBay עכשיו, האתר כשקליטת ההזמנות מהחנות תופעל) ומקושר להזמנות שלו.
// קורא רק מ-Postgres.

type Filter = 'all' | 'repeat' | 'marketing' | 'ebay' | 'woo' | 'issues'
type Sort = 'recent' | 'spent' | 'orders'

interface Page {
  rows: CustomerRow[]
  nextOffset: number | null
  counts: { total: number; repeat: number; marketing: number; ebay: number; woo: number; countries: number; new30: number; issues: number }
  countries: CountryStat[]
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="ax-skel" style={{ height: 320 }} />}>
      <Customers />
    </Suspense>
  )
}

function Customers() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filter = ((['all', 'repeat', 'marketing', 'ebay', 'woo', 'issues'] as const).find((f) => f === params.get('filter')) ?? 'all') as Filter
  const sort = ((['recent', 'spent', 'orders'] as const).find((s) => s === params.get('sort')) ?? 'recent') as Sort
  const country = /^[A-Z]{2}$/.test(params.get('country') ?? '') ? params.get('country')! : ''
  const q = params.get('q') ?? ''
  const [query, setQuery] = useState(q)
  const [more, setMore] = useState<CustomerRow[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const setParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(params.toString())
      if (value && value !== 'all' && !(key === 'sort' && value === 'recent')) sp.set(key, value)
      else sp.delete(key)
      router.replace(`${pathname}${sp.toString() ? '?' + sp : ''}`, { scroll: false })
    },
    [params, pathname, router],
  )
  useEffect(() => setQuery(q), [q])
  useEffect(() => {
    if (query === q) return
    const t = window.setTimeout(() => setParam('q', query.trim()), 400)
    return () => window.clearTimeout(t)
  }, [query, q, setParam])

  const url = (offset = 0) => `/api/sync/customers?filter=${filter}&sort=${sort}&country=${country}&q=${encodeURIComponent(q)}&offset=${offset}`
  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<Page>(url())
    setMore([])
    setNextOffset(r.nextOffset)
    return r
  }, [filter, sort, country, q])
  useDataChanged(reload)

  const loadMore = async () => {
    if (nextOffset === null) return
    setLoadingMore(true)
    try {
      const r = await api.get<Page>(url(nextOffset))
      setMore((m) => [...m, ...r.rows])
      setNextOffset(r.nextOffset)
    } finally {
      setLoadingMore(false)
    }
  }

  const c = data?.counts
  const rows = data ? [...data.rows, ...more] : null
  const filtered = filter !== 'all' || !!country || !!q

  if (error) return <LoadError error={error} retry={reload} />

  if (data && c!.total === 0)
    return (
      <>
        <Head sub="עוד אין לקוחות במאגר" />
        <EmptyState icon={Users} title="המאגר מתמלא מההזמנות" text="כל הזמנה חדשה מ-eBay יוצרת או מעדכנת לקוח ומקשרת אליו את ההזמנה. לקוחות מההזמנות הקודמות נכנסים בהשלמה אחורה מ-eBay." />
      </>
    )

  return (
    <>
      <Head sub={!data ? ' ' : `${num(c!.total)} לקוחות מ-${num(c!.countries)} מדינות · ${num(c!.marketing)} מאושרים לדיוור`} />

      {!data ? (
        <div className="ax-kpis">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ax-skel" style={{ height: 118 }} />
          ))}
        </div>
      ) : (
        <div className="ax-kpis">
          <Kpi label="לקוחות" value={num(c!.total)} sub={`${num(c!.new30)} חדשים ב-30 הימים האחרונים`} />
          <Kpi label="לקוחות חוזרים" value={num(c!.repeat)} sub={`${pct(c!.total ? c!.repeat / c!.total : null)} קנו יותר מפעם אחת`} />
          <Kpi label="מדינות" value={num(c!.countries)} sub={data.countries[0]?.countryCode ? `הכי הרבה: ${countryName(data.countries[0].countryCode)}` : undefined} />
          <Kpi label="מאושרים לדיוור" value={num(c!.marketing)} sub="רק מי שהסכים בקופה או בפנייה ישירה" />
        </div>
      )}

      {data && data.countries.length > 0 && <Countries countries={data.countries} total={c!.total} active={country} onPick={(v) => setParam('country', v === country ? '' : v)} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Seg
          label="סינון לקוחות"
          options={[
            ['all', 'הכל', c?.total],
            ['repeat', 'חוזרים', c?.repeat],
            ['marketing', 'מאושרים לדיוור', c?.marketing],
            ['ebay', 'eBay', c?.ebay],
            ['woo', 'האתר', c?.woo],
            ['issues', 'עם החזרות / קייסים', c?.issues],
          ]}
          value={filter}
          onChange={(v) => setParam('filter', v)}
        />
        <Seg
          label="מיון"
          options={[
            ['recent', 'הזמנה אחרונה'],
            ['spent', 'סך קניות'],
            ['orders', 'מספר הזמנות'],
          ]}
          value={sort}
          onChange={(v) => setParam('sort', v)}
        />
        <div className="ax-search" style={{ minWidth: 220 }} role="search">
          <Search size={18} aria-hidden="true" />
          <input type="search" className="ax-input" aria-label="חיפוש לקוח" placeholder="שם, מייל מלא, עיר, מספר הזמנה" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {country && (
          <button type="button" className="ax-btn is-sm" onClick={() => setParam('country', '')} aria-label={`ביטול הסינון לפי ${countryName(country)}`}>
            {countryName(country)}
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {!rows ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <div className="ax-card">
          <p className="ax-note">{filtered ? 'אין לקוחות שמתאימים לסינון.' : 'אין לקוחות.'}</p>
        </div>
      ) : (
        <>
          <section className="ax-card" aria-label="לקוחות">
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table" style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th>לקוח</th>
                      <th>מיקום</th>
                      <th>הזמנות</th>
                      <th>סך קניות</th>
                      <th>הזמנה אחרונה</th>
                      <th>ערוץ</th>
                      <th>התנהלות</th>
                      <th>דיוור</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ minWidth: 240 }}>
                          <NameCell r={r} />
                        </td>
                        <td>{place(r)}</td>
                        <td className="ax-num">{num(r.orders)}</td>
                        <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                          {money(r.spent)}
                        </td>
                        <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                          {date(r.lastOrder)}
                        </td>
                        <td>
                          <Channels r={r} />
                        </td>
                        <td>
                          <Conduct r={r} />
                        </td>
                        <td>
                          <Pill t={MARKETING[r.marketing][1]}>{MARKETING[r.marketing][0]}</Pill>
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
                  <NameCell r={r} />
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    {place(r)} · <span className="ax-num">{num(r.orders)}</span> הזמנות · <span className="ax-num">{money(r.spent)}</span> · אחרונה <span className="ax-num">{date(r.lastOrder)}</span>
                  </span>
                  <Conduct r={r} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Channels r={r} />
                    <Pill t={MARKETING[r.marketing][1]}>{MARKETING[r.marketing][0]}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {nextOffset !== null && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת לקוחות נוספים
            </button>
          )}
        </>
      )}
    </>
  )
}

function Head({ sub }: { sub: string }) {
  return (
    <div className="ax-page-head">
      <div>
        <h1 className="ax-h1">לקוחות</h1>
        <p className="ax-sub">{sub}</p>
      </div>
    </div>
  )
}

/** עיר (בכיוון שלה) ומדינה בעברית */
const place = (r: CustomerRow) => (
  <span>
    {r.city && (
      <>
        <bdi>{r.city}</bdi>,{' '}
      </>
    )}
    {countryName(r.countryCode)}
  </span>
)

function NameCell({ r }: { r: CustomerRow }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
      <Link href={`/sync/customers/${r.id}`} className="ax-row-title">
        {r.name ?? r.ebayUsername ?? (r.marketing === 'anonymized' ? 'לקוח שנמחק' : 'ללא שם')}
      </Link>
      {(r.email || r.ebayUsername) && (
        <span className="ax-muted ax-ltr" dir="ltr" style={{ fontSize: 12, overflowWrap: 'anywhere', textAlign: 'right' }}>
          {r.email ?? `eBay: ${r.ebayUsername}`}
        </span>
      )}
    </span>
  )
}

/** רמת ההתנהלות + מה עומד מאחוריה בקצרה */
function Conduct({ r }: { r: CustomerRow }) {
  const k = r.conduct
  const n = (v: number | null | undefined, one: string, many: string) => (v ? `${v === 1 ? one : `${num(v)} ${many}`}` : null)
  const parts = [
    n(k.cases, 'קייס', 'קייסים'),
    n(k.returns, 'החזרה', 'החזרות'),
    n(k.inquiries, '"לא קיבלתי"', 'פניות "לא קיבלתי"'),
    n(k.cancelsBuyer, 'ביטול ביוזמתו', 'ביטולים ביוזמתו'),
    n(k.refunds, 'החזר כספי', 'החזרים כספיים'),
    n(k.ebay?.negativeLeft, 'פידבק שלילי שנתן', 'פידבקים שליליים שנתן'),
  ].filter(Boolean)
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <ConductBadge b={r.behavior} />
      {parts.length > 0 && (
        <span className="ax-muted" style={{ fontSize: 12 }}>
          {parts.join(' · ')}
        </span>
      )}
    </span>
  )
}

function Channels({ r }: { r: CustomerRow }) {
  const list = r.channels.length ? r.channels : [r.firstChannel]
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {list.map((ch) => (
        <Pill key={ch} t={CHANNEL_LABEL[ch]?.[1] ?? 'gray'}>
          {CHANNEL_LABEL[ch]?.[0] ?? ch}
        </Pill>
      ))}
    </span>
  )
}

/** פילוח לפי מדינה — 8 המובילות, לחיצה מסננת את הרשימה */
function Countries({ countries, total, active, onPick }: { countries: CountryStat[]; total: number; active: string; onPick: (code: string) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? countries : countries.slice(0, 8)
  const max = Math.max(1, ...countries.map((x) => x.customers))
  return (
    <section className="ax-card" aria-labelledby="countries-h">
      <div className="ax-card-head" style={{ justifyContent: 'flex-start' }}>
        <span className="ax-tile" aria-hidden="true">
          <Globe2 size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="countries-h" className="ax-h2">
            לקוחות לפי מדינה
          </h2>
          <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
            לחיצה על מדינה מסננת את הרשימה
          </p>
        </div>
      </div>
      <div className="ax-rows">
        {shown.map((x) => (
          <button
            key={x.countryCode ?? 'none'}
            type="button"
            className="ax-row-btn"
            onClick={() => x.countryCode && onPick(x.countryCode)}
            disabled={!x.countryCode}
            aria-pressed={!!x.countryCode && active === x.countryCode}
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, ...(active && active === x.countryCode ? { background: 'var(--ax-tint)' } : {}) }}
          >
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>{countryName(x.countryCode)}</span>
              <span className="ax-muted" style={{ fontSize: 13 }}>
                <span className="ax-num" style={{ color: 'var(--ax-text)', fontWeight: 600 }}>
                  {num(x.customers)}
                </span>{' '}
                לקוחות ({pct(total ? x.customers / total : null)}) · <span className="ax-num">{num(x.orders)}</span> הזמנות · <span className="ax-num">{money(Math.round(x.revenue))}</span>
              </span>
            </span>
            <span className="ax-bar" role="presentation">
              <span style={{ width: `${(x.customers / max) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
      {countries.length > 8 && (
        <div style={{ padding: '0 20px 16px' }}>
          <button type="button" className="ax-btn is-sm is-ghost" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? 'פחות מדינות' : `כל ${num(countries.length)} המדינות`}
          </button>
        </div>
      )}
    </section>
  )
}
