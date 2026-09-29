'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, Lightbulb, PlugZap, RefreshCw, Settings } from 'lucide-react'
import type { AnalyticsReport } from '@/lib/analytics/report'
import type { Insight, InsightCategory } from '@/lib/analytics/insights'
import { api, ApiError } from '@/components/sync/api'
import { ago, date, duration, money, num, pct } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import { DailyBars, DataTable, DeltaKpi, Funnel, PageCell, SeverityPill, Term } from '@/components/sync/insights/parts'
import { SpendCard } from '@/components/sync/insights/SpendCard'
import type { BackgroundRun } from '@/components/sync/types'
import { EmptyState, LoadError, Pill, Seg, Spin, useLoad, useToast } from '@/components/sync/ui'

// תובנות: Search Console + Google Analytics 4 + מכירות eBay מהמערכת. קורא רק מ-Postgres;
// "משיכת נתונים" מושכת מגוגל ומהחנות (קריאה בלבד) ברקע. התובנות = כללים קבועים (lib/analytics/insights.ts), בלי AI.

type Tab = 'overview' | 'traffic' | 'search' | 'products' | 'marketing'
const TABS: [Tab, string][] = [
  ['overview', 'סקירה ותובנות'],
  ['traffic', 'תנועה ומכירות'],
  ['search', 'חיפוש בגוגל'],
  ['products', 'מוצרים'],
  ['marketing', 'שיווק ו-ROI'],
]
type Days = '7' | '28' | '90'

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="ax-skel" style={{ height: 320 }} />}>
      <Insights />
    </Suspense>
  )
}

function Insights() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const tab = (TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'overview') as Tab
  const days = (['7', '28', '90'].includes(params.get('days') ?? '') ? params.get('days') : '28') as Days
  const [fetching, setFetching] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const setParam = useCallback(
    (key: string, value: string, def: string) => {
      const sp = new URLSearchParams(params.toString())
      if (value === def) sp.delete(key)
      else sp.set(key, value)
      router.replace(`${pathname}${sp.toString() ? '?' + sp : ''}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const { data, error, reload } = useLoad(() => api.get<AnalyticsReport>(`/api/sync/analytics/report?days=${days}`), [days])
  useDataChanged(reload)

  const fetchNow = async () => {
    setFetching(true)
    let runId: string
    try {
      runId = (await api.post<{ runId: string }>('/api/sync/analytics/fetch')).runId
    } catch (e) {
      setFetching(false)
      toast(e instanceof ApiError && e.status === 409 ? 'כבר רצה פעולה אחרת — נסה שוב בעוד רגע' : e instanceof Error ? e.message : 'המשיכה נכשלה', 'bad')
      return
    }
    const tick = async () => {
      try {
        const r = await api.get<BackgroundRun>(`/api/ebay/import?runId=${runId}`)
        if (r.status === 'running') {
          timer.current = window.setTimeout(tick, 1500)
          return
        }
        setFetching(false)
        if (r.status === 'failed') return toast(r.error ?? 'המשיכה נכשלה', 'bad')
        const res = r.result as { sources: { source: string; ok: boolean; skipped?: string; error?: string }[] }
        const failed = res.sources.filter((s) => !s.ok)
        toast(failed.length ? `חלק מהמקורות נכשלו: ${failed.map((s) => s.error).join(' · ')}` : 'הנתונים עודכנו', failed.length ? 'bad' : 'ok')
        void reload()
      } catch (e) {
        setFetching(false)
        toast(e instanceof Error ? e.message : 'המשיכה נכשלה', 'bad')
      }
    }
    void tick()
  }

  const setup = data?.setup
  const connected = !!setup && (setup.gsc || setup.ga4)
  const hasData = !!setup && (!!setup.gscRange || !!setup.gaRange)
  const sub = !data
    ? ' '
    : !connected
      ? 'גוגל עוד לא מחובר'
      : !hasData
        ? 'מחובר — עוד לא נמשכו נתונים'
        : [data.insights.length ? `${num(data.insights.length)} תובנות לטיפול` : 'אין כרגע תובנות לטיפול', setup!.lastFetchAt ? `עודכן ${ago(setup!.lastFetchAt)}` : null].filter(Boolean).join(' · ')

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">תובנות</h1>
          <p className="ax-sub">{sub}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link href="/sync/insights/glossary" className="ax-btn is-ghost">
            <BookOpen size={18} aria-hidden="true" />
            מילון מונחים
          </Link>
          {connected && (
            <button type="button" className="ax-btn" onClick={fetchNow} disabled={fetching}>
              {fetching ? <Spin /> : <RefreshCw size={16} aria-hidden="true" />}
              {fetching ? 'מושך מגוגל…' : 'משיכת נתונים'}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !data ? (
        <>
          <div className="ax-kpis">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="ax-skel" style={{ height: 118 }} />
            ))}
          </div>
          <div className="ax-skel" style={{ height: 320 }} />
        </>
      ) : !connected ? (
        <EmptyState
          icon={PlugZap}
          title="מחברים את גוגל כדי לקבל תובנות"
          text="המסך יציג תנועה, חיפושים בגוגל, מכירות, ROI והמלצות לפעולה. צריך service account של גוגל עם הרשאת צפייה ב-Search Console וב-Analytics — ההוראות במסך ההגדרות."
          action={
            <Link href="/sync/settings#google" className="ax-btn is-primary">
              <Settings size={18} aria-hidden="true" />
              להגדרות החיבור
            </Link>
          }
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <Seg label="אזור" options={TABS.map(([v, l]) => [v, l])} value={tab} onChange={(v) => setParam('tab', v, 'overview')} />
            <Seg
              label="תקופה"
              options={[
                ['7', '7 ימים'],
                ['28', '28 ימים'],
                ['90', '90 ימים'],
              ]}
              value={days}
              onChange={(v) => setParam('days', v, '28')}
            />
          </div>
          <p className="ax-hint" style={{ margin: '-12px 0 0' }}>
            <span className="ax-num">
              {date(data.period.from)} – {date(data.period.to)}
            </span>{' '}
            מול{' '}
            <span className="ax-num">
              {date(data.prevPeriod.from)} – {date(data.prevPeriod.to)}
            </span>
            . Search Console מתעדכן באיחור של 2–3 ימים.
          </p>

          {!hasData && (
            <div className="ax-alert is-warn" role="status">
              <Lightbulb size={18} aria-hidden="true" />
              <span>החיבור מוגדר אבל עוד לא נמשכו נתונים. &quot;משיכת נתונים&quot; מביאה את 90 הימים האחרונים; אחר כך הנתונים מתעדכנים פעם ביום.</span>
            </div>
          )}

          {tab === 'overview' && <Overview r={data} />}
          {tab === 'traffic' && <Traffic r={data} />}
          {tab === 'search' && <Search r={data} />}
          {tab === 'products' && <Products r={data} />}
          {tab === 'marketing' && <Marketing r={data} onChanged={reload} />}
        </>
      )}
    </>
  )
}

/* ═════════════════════════════ סקירה ═════════════════════════════ */

const CATEGORY: Record<InsightCategory, string> = {
  setup: 'הגדרה',
  sales: 'מכירות',
  products: 'מוצרים',
  stock: 'מלאי',
  search: 'חיפוש',
  traffic: 'תנועה',
  marketing: 'שיווק',
}

function Overview({ r }: { r: AnalyticsReport }) {
  const s = r.site
  const g = r.search
  const e = r.ebay
  const [metric, setMetric] = useState<'revenue' | 'sessions' | 'clicks' | 'impressions'>(r.setup.gaRange ? 'sessions' : 'clicks')
  const [cat, setCat] = useState<'all' | InsightCategory>('all')
  const counts = r.insights.reduce<Record<string, number>>((a, i) => ((a[i.category] = (a[i.category] ?? 0) + 1), a), {})
  const shown = cat === 'all' ? r.insights : r.insights.filter((i) => i.category === cat)
  const METRIC: Record<typeof metric, [string, (v: number) => string]> = {
    revenue: ['הכנסות מהאתר ביום', (v) => money(Math.round(v))],
    sessions: ['ביקורים ביום', (v) => num(v)],
    clicks: ['הקלקות מגוגל ביום', (v) => num(v)],
    impressions: ['חשיפות בגוגל ביום', (v) => num(v)],
  }

  return (
    <>
      <section aria-labelledby="kpi-sales-h" className="ax-section" style={{ gap: 12 }}>
        <h2 id="kpi-sales-h" className="ax-h2">
          מכירות
        </h2>
        <div className="ax-kpis">
          <DeltaKpi term="revenue" label="הכנסות מהאתר" value={money(Math.round(s.cur.revenue))} cur={s.cur.revenue} prev={s.prev.revenue} sub={<span>{num(s.cur.purchases)} הזמנות</span>} />
          <DeltaKpi term="conversion-rate" label="שיעור המרה" value={pct(s.cur.conversionRate)} cur={s.cur.conversionRate} prev={s.prev.conversionRate} points />
          <DeltaKpi term="aov" label="ערך הזמנה ממוצע" value={money(s.cur.aov === null ? null : Math.round(s.cur.aov))} cur={s.cur.aov} prev={s.prev.aov} />
          <DeltaKpi term="multichannel" label="מכירות ב-eBay" value={money(Math.round(e.cur.revenue))} cur={e.cur.revenue} prev={e.prev.revenue} sub={<span>{num(e.cur.orders)} הזמנות · {num(e.cur.units)} יח׳</span>} />
        </div>
      </section>

      <section aria-labelledby="kpi-traffic-h" className="ax-section" style={{ gap: 12 }}>
        <h2 id="kpi-traffic-h" className="ax-h2">
          תנועה
        </h2>
        <div className="ax-kpis">
          <DeltaKpi term="sessions" label="ביקורים" value={num(s.cur.sessions)} cur={s.cur.sessions} prev={s.prev.sessions} sub={<span>{num(s.cur.users)} משתמשים</span>} />
          <DeltaKpi term="engagement-rate" label="שיעור מעורבות" value={pct(s.cur.engagementRate)} cur={s.cur.engagementRate} prev={s.prev.engagementRate} points />
          <DeltaKpi term="clicks" label="הקלקות מגוגל" value={num(g.cur.clicks)} cur={g.cur.clicks} prev={g.prev.clicks} sub={<span>{num(g.cur.impressions)} חשיפות</span>} />
          <DeltaKpi term="avg-position" label="מיקום ממוצע בגוגל" value={g.cur.position === null ? '—' : g.cur.position.toFixed(1)} cur={g.cur.position} prev={g.prev.position} lowerIsBetter />
        </div>
      </section>

      <section className="ax-card" aria-labelledby="chart-h">
        <div className="ax-card-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <h2 id="chart-h" className="ax-h2">
            {METRIC[metric][0]}
          </h2>
          <Seg
            label="מדד בגרף"
            options={[
              ['sessions', 'ביקורים'],
              ['revenue', 'הכנסות'],
              ['clicks', 'הקלקות'],
              ['impressions', 'חשיפות'],
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>
        <div className="ax-card-pad" style={{ paddingTop: 28 }}>
          <DailyBars points={r.daily.map((d) => ({ date: d.date, value: d[metric] }))} label={METRIC[metric][0]} format={METRIC[metric][1]} />
        </div>
      </section>

      <section aria-labelledby="insights-h" className="ax-section" style={{ gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="insights-h" className="ax-h2">
            תובנות והמלצות
          </h2>
          {r.insights.length > 0 && (
            <Seg
              label="סינון תובנות"
              options={[['all', 'הכל', r.insights.length] as ['all', string, number], ...(Object.keys(CATEGORY) as InsightCategory[]).filter((c) => counts[c]).map((c) => [c, CATEGORY[c], counts[c]] as [InsightCategory, string, number])]}
              value={cat}
              onChange={setCat}
            />
          )}
        </div>
        {shown.length === 0 ? (
          <div className="ax-card">
            <p className="ax-note">אין כרגע ממצאים שמצריכים טיפול. התובנות מתעדכנות עם כל משיכת נתונים — ככל שיש יותר תנועה, יש יותר מה להשוות.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shown.map((i) => (
              <InsightCard key={i.key} i={i} />
            ))}
          </div>
        )}
        <p className="ax-hint" style={{ margin: 0 }}>
          התובנות מחושבות לפי כללים קבועים על המספרים (בלי AI). כל תובנה מציגה את הנתונים שהובילו אליה.
        </p>
      </section>
    </>
  )
}

function InsightCard({ i }: { i: Insight }) {
  return (
    <article className="ax-card" aria-labelledby={`ins-${i.key}`}>
      <div className="ax-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <SeverityPill s={i.severity} />
          <Pill t="gray">{CATEGORY[i.category]}</Pill>
        </div>
        <h3 id={`ins-${i.key}`} className="ax-h2" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          {i.title}
        </h3>
        <p style={{ margin: 0, color: 'var(--ax-text2)' }}>{i.finding}</p>
        <div className="ax-inner" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Lightbulb size={18} aria-hidden="true" style={{ color: 'var(--ax-accent-text)', flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong style={{ fontWeight: 600 }}>מה לעשות: </strong>
            {i.action}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 13 }}>
          {i.metrics.map(([k, v]) => (
            <span key={k}>
              <span className="ax-muted">{k}: </span>
              <span className="ax-num" style={{ fontWeight: 600 }}>
                {v}
              </span>
            </span>
          ))}
        </div>
        {i.items && i.items.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {i.items.map((it, n) => (
              <li key={n} style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
                {it.internal ? (
                  <Link href={it.internal} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, overflowWrap: 'anywhere' }}>
                    {it.label}
                    <ChevronLeft size={14} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className={it.label.startsWith('/') ? 'ax-num ax-ltr' : undefined} dir={it.label.startsWith('/') ? 'ltr' : undefined} style={{ overflowWrap: 'anywhere' }}>
                    {it.label}
                  </span>
                )}
                {it.sub && (
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    {it.sub}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {i.terms.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12.5 }} className="ax-muted">
            <span>מונחים:</span>
            {i.terms.map((t) => (
              <Term key={t} id={t} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

/* ═════════════════════════════ תנועה ומכירות ═════════════════════════════ */

const CHANNEL_HE: Record<string, string> = {
  'Organic Search': 'חיפוש אורגני',
  Direct: 'ישיר',
  Referral: 'הפניה מאתר אחר',
  'Paid Search': 'חיפוש ממומן',
  'Paid Social': 'רשתות חברתיות — ממומן',
  'Organic Social': 'רשתות חברתיות',
  Email: 'אימייל',
  'Paid Shopping': 'שופינג ממומן',
  'Organic Shopping': 'שופינג אורגני',
  Display: 'באנרים',
  'Cross-network': 'קמפיינים משולבים',
  Unassigned: 'לא משויך',
  desktop: 'מחשב',
  mobile: 'נייד',
  tablet: 'טאבלט',
}

function Traffic({ r }: { r: AnalyticsReport }) {
  const s = r.site
  if (!r.setup.ga4) return <NotConnected what="Google Analytics" />
  const breakdownCols = (first: string) => [
    { key: 'v', label: first, render: (x: AnalyticsReport['channels'][number]) => <span className="ax-row-title">{CHANNEL_HE[x.value] ? `${CHANNEL_HE[x.value]} ` : ''}<span className="ax-muted ax-ltr" style={{ fontWeight: 400, fontSize: 12 }}>{CHANNEL_HE[x.value] ? `(${x.value})` : x.value}</span></span>, minWidth: 200 },
    { key: 's', label: <Term id="sessions">ביקורים</Term>, short: 'ביקורים', num: true, render: (x: AnalyticsReport['channels'][number]) => num(x.sessions) },
    { key: 'sh', label: 'חלק מהתנועה', short: 'חלק', num: true, render: (x: AnalyticsReport['channels'][number]) => pct(x.share) },
    { key: 'e', label: <Term id="engagement-rate">מעורבות</Term>, short: 'מעורבות', num: true, render: (x: AnalyticsReport['channels'][number]) => pct(x.engagementRate) },
    { key: 'p', label: <Term id="purchases">רכישות</Term>, short: 'רכישות', num: true, render: (x: AnalyticsReport['channels'][number]) => num(x.purchases) },
    { key: 'c', label: <Term id="conversion-rate">המרה</Term>, short: 'המרה', num: true, render: (x: AnalyticsReport['channels'][number]) => pct(x.conversionRate) },
    { key: 'r', label: <Term id="revenue">הכנסות</Term>, short: 'הכנסות', num: true, render: (x: AnalyticsReport['channels'][number]) => money(Math.round(x.revenue)) },
  ]
  return (
    <>
      <div className="ax-kpis">
        <DeltaKpi term="users" label="משתמשים" value={num(s.cur.users)} cur={s.cur.users} prev={s.prev.users} sub={<span>{num(s.cur.newUsers)} חדשים · {num(s.cur.returningUsers)} חוזרים</span>} />
        <DeltaKpi term="sessions" label="ביקורים" value={num(s.cur.sessions)} cur={s.cur.sessions} prev={s.prev.sessions} />
        <DeltaKpi term="pages-per-session" label="דפים לביקור" value={s.cur.pagesPerSession === null ? '—' : s.cur.pagesPerSession.toFixed(1)} cur={s.cur.pagesPerSession} prev={s.prev.pagesPerSession} />
        <DeltaKpi term="bounce-rate" label="שיעור נטישה" value={pct(s.cur.bounceRate)} cur={s.cur.bounceRate} prev={s.prev.bounceRate} lowerIsBetter points />
        <DeltaKpi term="avg-engagement-time" label="זמן מעורבות ממוצע" value={duration(s.cur.avgEngagementSec)} cur={s.cur.avgEngagementSec} prev={s.prev.avgEngagementSec} />
        <DeltaKpi term="revenue-per-session" label="הכנסה לביקור" value={money(s.cur.revenuePerSession === null ? null : Math.round(s.cur.revenuePerSession * 100) / 100)} cur={s.cur.revenuePerSession} prev={s.prev.revenuePerSession} />
        <DeltaKpi term="cart-abandonment" label="נטישת עגלה" value={pct(s.cur.cartAbandonment)} cur={s.cur.cartAbandonment} prev={s.prev.cartAbandonment} lowerIsBetter points />
        <DeltaKpi term="checkout-abandonment" label="נטישה בקופה" value={pct(s.cur.checkoutAbandonment)} cur={s.cur.checkoutAbandonment} prev={s.prev.checkoutAbandonment} lowerIsBetter points />
      </div>

      <section className="ax-card" aria-labelledby="funnel-h">
        <div className="ax-card-head">
          <h2 id="funnel-h" className="ax-h2">
            <Term id="funnel">משפך מכירה</Term>
          </h2>
        </div>
        <Funnel
          steps={[
            { term: 'sessions', label: 'ביקורים', value: s.cur.sessions },
            { term: 'add-to-cart', label: 'הוספות לעגלה', value: s.cur.addToCarts },
            { term: 'checkout', label: 'התחלות תשלום', value: s.cur.checkouts },
            { term: 'purchases', label: 'רכישות', value: s.cur.purchases },
          ]}
        />
      </section>

      <section className="ax-card" aria-labelledby="ch-h">
        <div className="ax-card-head">
          <h2 id="ch-h" className="ax-h2">
            <Term id="traffic-channel">מקורות תנועה</Term>
          </h2>
        </div>
        <DataTable rows={r.channels} rowKey={(x) => x.value} label="מקורות תנועה" empty="עוד אין נתוני תנועה." cols={breakdownCols('ערוץ')} />
      </section>

      <div className="ax-grid-auto">
        <section className="ax-card" aria-labelledby="dev-h">
          <div className="ax-card-head">
            <h2 id="dev-h" className="ax-h2">
              <Term id="device">מכשירים</Term>
            </h2>
          </div>
          <DataTable rows={r.devices} rowKey={(x) => x.value} label="מכשירים" empty="עוד אין נתונים." cols={breakdownCols('מכשיר').filter((c) => ['v', 's', 'sh', 'c'].includes(c.key))} minWidth={420} />
        </section>
        <section className="ax-card" aria-labelledby="co-h">
          <div className="ax-card-head">
            <h2 id="co-h" className="ax-h2">
              מדינות
            </h2>
          </div>
          <DataTable rows={r.countries} rowKey={(x) => x.value} label="מדינות" empty="עוד אין נתונים." cols={breakdownCols('מדינה').filter((c) => ['v', 's', 'sh', 'c'].includes(c.key))} minWidth={420} />
        </section>
      </div>
    </>
  )
}

/* ═════════════════════════════ חיפוש ═════════════════════════════ */

function Search({ r }: { r: AnalyticsReport }) {
  const g = r.search
  if (!r.setup.gsc) return <NotConnected what="Search Console" />
  type P = AnalyticsReport['pages'][number]
  type Q = AnalyticsReport['queries'][number]
  const pos = (v: number | null) => (v === null ? '—' : v.toFixed(1))
  return (
    <>
      <div className="ax-kpis">
        <DeltaKpi term="clicks" label="הקלקות" value={num(g.cur.clicks)} cur={g.cur.clicks} prev={g.prev.clicks} />
        <DeltaKpi term="impressions" label="חשיפות" value={num(g.cur.impressions)} cur={g.cur.impressions} prev={g.prev.impressions} />
        <DeltaKpi term="ctr" label="שיעור הקלקה (CTR)" value={pct(g.cur.ctr)} cur={g.cur.ctr} prev={g.prev.ctr} points />
        <DeltaKpi term="avg-position" label="מיקום ממוצע" value={pos(g.cur.position)} cur={g.cur.position} prev={g.prev.position} lowerIsBetter />
      </div>

      <section className="ax-card" aria-labelledby="q-h">
        <div className="ax-card-head">
          <h2 id="q-h" className="ax-h2">
            <Term id="search-query">ביטויי חיפוש</Term>
          </h2>
          <span className="ax-hint">100 המובילים לפי חשיפות</span>
        </div>
        <DataTable<Q>
          rows={r.queries}
          rowKey={(x) => x.query}
          label="ביטויי חיפוש"
          empty="עוד אין נתוני חיפוש. באתר חדש לוקח לגוגל כמה שבועות להתחיל להציג אותו."
          cols={[
            { key: 'q', label: 'ביטוי', render: (x) => <span className="ax-row-title ax-ltr" dir="auto">{x.query}</span>, minWidth: 220 },
            { key: 'c', label: <Term id="clicks">הקלקות</Term>, short: 'הקלקות', num: true, render: (x) => num(x.clicks) },
            { key: 'i', label: <Term id="impressions">חשיפות</Term>, short: 'חשיפות', num: true, render: (x) => num(x.impressions) },
            { key: 'ctr', label: <Term id="ctr">CTR</Term>, short: 'CTR', num: true, render: (x) => pct(x.ctr) },
            { key: 'p', label: <Term id="avg-position">מיקום</Term>, short: 'מיקום', num: true, render: (x) => pos(x.position) },
            { key: 'pg', label: 'דף', short: 'דף', render: (x) => <span className="ax-num ax-ltr ax-muted" dir="ltr" style={{ fontSize: 12 }}>{x.page}</span>, minWidth: 180 },
          ]}
        />
      </section>

      <section className="ax-card" aria-labelledby="p-h">
        <div className="ax-card-head">
          <h2 id="p-h" className="ax-h2">
            דפים בגוגל
          </h2>
          <span className="ax-hint">100 המובילים לפי הקלקות</span>
        </div>
        <DataTable<P>
          rows={r.pages.filter((p) => p.impressions > 0 || p.prevImpressions > 0)}
          rowKey={(x) => x.page}
          label="דפים בגוגל"
          empty="עוד אין דפים עם חשיפות בגוגל."
          cols={[
            { key: 'pg', label: 'דף', render: (x) => <PageCell path={x.page} name={x.product?.name} productId={x.product?.productId} siteUrl={r.setup.storeUrl} />, minWidth: 260 },
            { key: 'c', label: <Term id="clicks">הקלקות</Term>, short: 'הקלקות', num: true, render: (x) => num(x.clicks) },
            { key: 'pc', label: 'קודם', short: 'קודם', num: true, render: (x) => num(x.prevClicks) },
            { key: 'i', label: <Term id="impressions">חשיפות</Term>, short: 'חשיפות', num: true, render: (x) => num(x.impressions) },
            { key: 'ctr', label: <Term id="ctr">CTR</Term>, short: 'CTR', num: true, render: (x) => pct(x.ctr) },
            { key: 'p', label: <Term id="avg-position">מיקום</Term>, short: 'מיקום', num: true, render: (x) => pos(x.position) },
          ]}
        />
      </section>
    </>
  )
}

/* ═════════════════════════════ מוצרים ═════════════════════════════ */

function Products({ r }: { r: AnalyticsReport }) {
  type I = AnalyticsReport['items'][number]
  if (!r.setup.ga4) return <NotConnected what="Google Analytics" />
  const stock = (x: I) => {
    const c = x.product
    if (!c) return <Pill t="gray">לא מזוהה</Pill>
    const out = c.stockStatus === 'outofstock' || (c.available !== null ? c.available <= 0 : (c.stockQuantity ?? 1) <= 0)
    return out ? <Pill t="warn" dot>אזל</Pill> : <Pill t="ok" dot>במלאי</Pill>
  }
  return (
    <>
      {!r.setup.ecommerceTracking && (
        <div className="ax-alert is-warn" role="status">
          <Lightbulb size={18} aria-hidden="true" />
          <span>
            עוד לא התקבלו נתוני מוצרים מ-GA. כדי שהטבלה תתמלא, החנות צריכה לשלוח אירועי <Term id="ecommerce-tracking">איקומרס</Term> (תוסף כמו Google for WooCommerce), כש-item_id הוא ה-SKU.
          </span>
        </div>
      )}
      <section className="ax-card" aria-labelledby="it-h">
        <div className="ax-card-head">
          <h2 id="it-h" className="ax-h2">
            ביצועי מוצרים באתר
          </h2>
          <span className="ax-hint">100 המובילים לפי צפיות</span>
        </div>
        <DataTable<I>
          rows={r.items}
          rowKey={(x) => x.itemId}
          label="ביצועי מוצרים"
          empty="אין עדיין נתוני מוצרים בתקופה הזו."
          minWidth={900}
          cols={[
            {
              key: 'n',
              label: 'מוצר',
              render: (x) => (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {x.product?.productId ? <Link href={`/sync/products/${x.product.productId}`} className="ax-row-title">{x.product.name}</Link> : <span className="ax-row-title">{x.name}</span>}
                  <span className="ax-num ax-ltr ax-muted" style={{ fontSize: 12 }}>{x.itemId}</span>
                </span>
              ),
              minWidth: 260,
            },
            { key: 'v', label: <Term id="item-views">צפיות</Term>, short: 'צפיות', num: true, render: (x) => num(x.viewed) },
            { key: 'a', label: <Term id="add-to-cart">לעגלה</Term>, short: 'לעגלה', num: true, render: (x) => num(x.addedToCart) },
            { key: 'cr', label: <Term id="cart-rate">% לעגלה</Term>, short: '% לעגלה', num: true, render: (x) => pct(x.cartRate) },
            { key: 'p', label: <Term id="purchases">נקנו</Term>, short: 'נקנו', num: true, render: (x) => num(x.purchased) },
            { key: 'r', label: <Term id="revenue">הכנסות</Term>, short: 'הכנסות', num: true, render: (x) => money(Math.round(x.revenue)) },
            { key: 's', label: <Term id="stock-status">מלאי</Term>, short: 'מלאי', render: stock },
          ]}
        />
      </section>
    </>
  )
}

/* ═════════════════════════════ שיווק ═════════════════════════════ */

function Marketing({ r, onChanged }: { r: AnalyticsReport; onChanged: () => void }) {
  const m = r.marketing
  const s = r.site
  return (
    <>
      <div className="ax-kpis">
        <DeltaKpi term="ad-spend" label="הוצאות שיווק" value={money(Math.round(m.cur.totalSpend))} cur={m.cur.totalSpend || null} prev={m.prev.totalSpend || null} lowerIsBetter sub={<span>{m.cur.adCost !== null ? `Google Ads ${money(Math.round(m.cur.adCost))}` : 'Google Ads לא מקושר'}</span>} />
        <DeltaKpi term="roas" label="ROAS" value={m.cur.roas === null ? '—' : m.cur.roas.toFixed(2)} cur={m.cur.roas} prev={m.prev.roas} />
        <DeltaKpi term="roi" label="ROI (לפי הכנסות)" value={pct(m.cur.roi, 0)} cur={m.cur.roi} prev={m.prev.roi} points />
        <DeltaKpi term="cpa" label="עלות לרכישה (CPA)" value={money(m.cur.cpa === null ? null : Math.round(m.cur.cpa))} cur={m.cur.cpa} prev={m.prev.cpa} lowerIsBetter />
        <DeltaKpi term="cpc" label="עלות לקליק (CPC)" value={money(m.cur.cpc === null ? null : Math.round(m.cur.cpc * 100) / 100)} cur={m.cur.cpc} prev={m.prev.cpc} lowerIsBetter />
        <DeltaKpi term="revenue" label="הכנסות מהאתר" value={money(Math.round(s.cur.revenue))} cur={s.cur.revenue} prev={s.prev.revenue} />
      </div>
      <div className="ax-alert is-warn" role="note">
        <Lightbulb size={18} aria-hidden="true" />
        <span>
          ה-ROI כאן מחושב על <strong>הכנסות</strong>, לא על רווח — עלות המוצרים לא נמצאת במערכת. כדי לדעת אם הפרסום רווחי, השוו את ה-<Term id="roas">ROAS</Term> ל-1 ÷ <Term id="gross-margin">הרווח הגולמי</Term>.
        </span>
      </div>
      <SpendCard rows={r.spend} onChanged={onChanged} />
    </>
  )
}

function NotConnected({ what }: { what: string }) {
  return (
    <div className="ax-card">
      <p className="ax-note">
        {what} עוד לא מחובר. <Link href="/sync/settings#google">להגדרות החיבור</Link>
      </p>
    </div>
  )
}
