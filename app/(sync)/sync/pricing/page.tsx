'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useState } from 'react'
import { ArrowDown, ArrowUp, Calculator, Check, ChevronDown, ExternalLink, RefreshCw, RotateCcw, Scale, Sparkles, Store, X } from 'lucide-react'
import type { DiffEffect, OfferComparisonView, OfferRow, PricePage, PriceRow, PriceFilter } from '@/lib/pricing/queries'
import { CONDITION_LABEL, POSITION_LABEL, type ConditionGroup, type Position } from '@/lib/pricing/match'
import { api } from '@/components/sync/api'
import { date, dateTime, money, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import { EmptyState, Kpi, LoadError, Modal, Pill, Seg, Spin, useLoad, useToast, type Tone } from '@/components/sync/ui'

// מחירים מול מתחרים ב-eBay: הבדיקה האחרונה לכל מוצר (npm run job:check-prices / "בדיקה עכשיו").
// ההשוואה הראשית היא מחיר כולל משלוח עד הקונה במדינה שנבחרה. קורא רק מ-Postgres; eBay נקרא רק ב"בדיקה עכשיו".

const POSITION_TONE: Record<Position, Tone> = {
  cheapest: 'ok',
  below_median: 'ok',
  at_median: 'blue',
  above_median: 'warn',
  most_expensive: 'bad',
  only_us: 'gray',
  no_price: 'gray',
}

const MATCH_LABEL: Record<OfferRow['matchLevel'], [string, Tone]> = {
  exact: ['התאמה מלאה', 'ok'],
  likely: ['התאמה סבירה', 'blue'],
  weak: ['התאמה חלשה', 'gray'],
}

type Ai = NonNullable<OfferComparisonView['ai']>

const SAME_LABEL: Record<Ai['sameProduct'], [string, Tone]> = {
  same: ['אותו מוצר', 'ok'],
  variant: ['גרסה אחרת', 'warn'],
  different: ['מוצר אחר', 'bad'],
  unsure: ['לא ברור אם זהה', 'gray'],
}

const JUSTIFIED_LABEL: Record<Ai['justified'], [string, Tone]> = {
  yes: ['הפער מוסבר', 'ok'],
  partly: ['הפער מוסבר חלקית', 'blue'],
  no: ['הפער לא מוסבר', 'warn'],
  unclear: ['לא ברור', 'gray'],
}

const COUNTRY_NAME: Record<string, string> = { US: 'ארה״ב', CA: 'קנדה', GB: 'בריטניה', AU: 'אוסטרליה', DE: 'גרמניה', FR: 'צרפת', IT: 'איטליה', ES: 'ספרד', NL: 'הולנד', JP: 'יפן', IL: 'ישראל' }
const countryName = (c: string | null) => (c ? COUNTRY_NAME[c] ?? c : '—')

const sellerUrl = (s: string) => `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(s)}`

/** +45.8% / −12% */
function signedPct(v: string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const r = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10
  return `⁦${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%⁩`
}

const ourTotal = (r: Pick<PriceRow, 'ourPrice' | 'ourShipping' | 'basis'>) =>
  r.ourPrice == null ? null : r.basis === 'total' && r.ourShipping != null ? Number(r.ourPrice) + Number(r.ourShipping) : Number(r.ourPrice)

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="ax-skel" style={{ height: 320 }} />}>
      <Pricing />
    </Suspense>
  )
}

function Pricing() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filter = ((['all', 'expensive', 'market', 'cheap', 'none'] as const).find((f) => f === params.get('filter')) ?? 'all') as PriceFilter
  const country = /^[A-Z]{2}$/.test(params.get('country') ?? '') ? params.get('country')! : ''
  const [open, setOpen] = useState<PriceRow | null>(null)

  const setParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(params.toString())
      if (value && value !== 'all') sp.set(key, value)
      else sp.delete(key)
      router.replace(`${pathname}${sp.toString() ? '?' + sp : ''}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const { data, error, reload } = useLoad(() => api.get<PricePage>(`/api/sync/pricing?filter=${filter}&country=${country}`), [filter, country])
  useDataChanged(reload)

  if (error) return <LoadError error={error} retry={reload} />

  if (data && data.counts.all === 0 && filter === 'all')
    return (
      <>
        <Head sub="עוד לא נבדקו מחירים" />
        <EmptyState
          icon={Scale}
          title="אין עדיין בדיקות מחיר"
          text="בדיקה מחפשת ב-eBay כל מוצר לפי מספר החלק, ומשווה את המחיר שלנו מול מוכרים אחרים באותו מצב. הבדיקות רצות מהשרת (job:check-prices)."
        />
      </>
    )

  const c = data?.counts
  const shownCountry = country || (data?.countries.includes('US') ? 'US' : data?.countries[0]) || 'US'

  return (
    <>
      <Head
        sub={
          !data
            ? ' '
            : `${num(c!.all)} מוצרים נבדקו · ${num(c!.expensive)} יקרים מהשוק · ${num(c!.none)} בלי מתחרים ב-eBay · בדיקה אחרונה ${date(data.lastCheckedAt)}`
        }
      />

      {!data ? (
        <div className="ax-kpis">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ax-skel" style={{ height: 118 }} />
          ))}
        </div>
      ) : (
        <div className="ax-kpis">
          <Kpi label="יקרים מהשוק" value={num(c!.expensive)} sub="מעל החציון של המתחרים" />
          <Kpi label="בגובה השוק" value={num(c!.market)} sub="עד 5% מהחציון" />
          <Kpi label="זולים מהשוק" value={num(c!.cheap)} sub="מתחת לחציון או הזולים ביותר" />
          <Kpi label="בלי מתחרים" value={num(c!.none)} sub="אין מודעה מתאימה באותו מצב" />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Seg
          label="סינון לפי מיקום במחיר"
          options={[
            ['all', 'הכל', c?.all],
            ['expensive', 'יקרים', c?.expensive],
            ['market', 'בגובה השוק', c?.market],
            ['cheap', 'זולים', c?.cheap],
            ['none', 'בלי מתחרים', c?.none],
          ]}
          value={filter}
          onChange={(v) => setParam('filter', v)}
        />
        {data && data.countries.length > 1 && (
          <Seg label="מדינת הקונה" options={data.countries.map((x) => [x, countryName(x)] as [string, string])} value={shownCountry} onChange={(v) => setParam('country', v)} />
        )}
      </div>
      {data && (
        <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
          מוצגים מתחרים לכל יעדי המשלוח. המחירים כוללים משלוח עד קונה ב{countryName(shownCountry)} כשהמשלוח לשם ידוע לשני הצדדים; אחרת — מחיר פריט בלבד. משווים רק מול מודעות באותו מצב (חדש / מחודש / משומש).
        </p>
      )}

      {!data ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : data.rows.length === 0 ? (
        <div className="ax-card">
          <p className="ax-note">אין מוצרים בסינון הזה.</p>
        </div>
      ) : (
        <section className="ax-card" aria-label="מחירים מול מתחרים">
          <div className="ax-only-desktop">
            <div className="ax-table-wrap">
              <table className="ax-table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>מוצר</th>
                    <th>מצב</th>
                    <th>שלנו</th>
                    <th>המתחרים</th>
                    <th>איפה אנחנו</th>
                    <th>מודעות</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.checkId}>
                      <td style={{ minWidth: 220, maxWidth: 300 }}>
                        <ProductCell r={r} />
                      </td>
                      <td>{CONDITION_LABEL[r.conditionGroup as ConditionGroup] ?? r.conditionGroup}</td>
                      <td style={{ minWidth: 120 }}>
                        <Ours r={r} />
                      </td>
                      <td style={{ minWidth: 190 }}>
                        <Market r={r} />
                      </td>
                      <td>
                        <PositionCell r={r} />
                      </td>
                      <td>
                        <button type="button" className="ax-btn is-sm" onClick={() => setOpen(r)}>
                          מודעות ({num(r.compareCount)})
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="ax-only-mobile ax-mcards">
            {data.rows.map((r) => (
              <div key={r.checkId} className="ax-mcard" style={{ gap: 8 }}>
                <ProductCell r={r} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <PositionCell r={r} />
                  <Pill t="gray">{CONDITION_LABEL[r.conditionGroup as ConditionGroup] ?? r.conditionGroup}</Pill>
                </div>
                <span className="ax-muted" style={{ fontSize: 12.5 }}>
                  שלנו <Ours r={r} /> · מתחרים <Market r={r} />
                </span>
                <button type="button" className="ax-btn is-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(r)}>
                  מודעות המתחרים ({num(r.compareCount)})
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && data.sellers.length > 0 && <Sellers sellers={data.sellers} />}

      {open && <OffersDialog row={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  )
}

function Head({ sub }: { sub: string }) {
  return (
    <div className="ax-page-head">
      <div>
        <h1 className="ax-h1">השוואת מחירים</h1>
        <p className="ax-sub">{sub}</p>
      </div>
      <Link href="/sync/pricing/quote" className="ax-btn is-primary">
        <Calculator size={18} aria-hidden="true" />
        בדיקת הצעת לקוח
      </Link>
    </div>
  )
}

function ProductCell({ r }: { r: PriceRow }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
      <Link href={`/sync/products/${r.productId}`} className="ax-row-title" style={{ overflowWrap: 'anywhere' }}>
        {r.title}
      </Link>
      <span className="ax-muted" style={{ fontSize: 12 }}>
        {r.brand && (
          <>
            <bdi>{r.brand}</bdi> ·{' '}
          </>
        )}
        מספר חלק <bdi className="ax-num">{r.mpn}</bdi> · מק״ט <bdi className="ax-num">{r.sku}</bdi>
      </span>
    </span>
  )
}

function Ours({ r }: { r: PriceRow }) {
  const total = ourTotal(r)
  return (
    <span title={r.basis === 'total' ? `פריט ${money(r.ourPrice)} + משלוח ${money(r.ourShipping)}` : 'מחיר פריט'}>
      <span className="ax-num">{money(total)}</span>
      {r.basis === 'total' && r.ourShipping != null && (
        <span className="ax-muted" style={{ fontSize: 12 }}>
          {' '}
          (כולל <span className="ax-num">{money(r.ourShipping)}</span> משלוח)
        </span>
      )}
    </span>
  )
}

function Market({ r }: { r: PriceRow }) {
  if (!r.compareCount) return <span className="ax-muted">{r.error ? 'הבדיקה נכשלה' : 'אין מתחרים'}</span>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span>
        חציון <span className="ax-num">{money(r.medianPrice)}</span>
      </span>
      <span className="ax-muted" style={{ fontSize: 12 }}>
        <span className="ax-num">{money(r.minPrice)}</span> עד <span className="ax-num">{money(r.maxPrice)}</span> · <span className="ax-num">{num(r.compareCount)}</span> מודעות
      </span>
      {r.cheapestSeller && (
        <span className="ax-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          הזול: <SellerLink seller={r.cheapestSeller} />
        </span>
      )}
      {r.cheapestWhy && (
        <span style={{ fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <Sparkles size={13} aria-hidden="true" style={{ color: 'var(--ax-accent-text)', flexShrink: 0 }} />
          <span>
            <span className="ax-sr">למה הפער: </span>
            {r.cheapestSame === 'different' ? 'כנראה מוצר אחר — ' : r.cheapestSame === 'variant' ? 'גרסה אחרת — ' : ''}
            {r.cheapestWhy}
          </span>
        </span>
      )}
    </span>
  )
}

function PositionCell({ r }: { r: PriceRow }) {
  const p = r.position as Position
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
      <Pill t={r.error ? 'bad' : POSITION_TONE[p] ?? 'gray'}>{r.error ? 'שגיאה בבדיקה' : POSITION_LABEL[p] ?? p}</Pill>
      {r.vsMedianPct != null && (
        <span className="ax-muted" style={{ fontSize: 12 }}>
          {signedPct(r.vsMedianPct)} מהחציון
        </span>
      )}
    </span>
  )
}

function SellerLink({ seller }: { seller: string }) {
  return (
    <a
      href={sellerUrl(seller)}
      target="_blank"
      rel="noopener noreferrer"
      className="ax-ltr"
      dir="ltr"
      aria-label={`${seller} — כל המודעות של המוכר ב-eBay (נפתח בחלון חדש)`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {seller}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  )
}

/** המוכרים שחוזרים הכי הרבה מול המוצרים שלנו */
function Sellers({ sellers }: { sellers: PricePage['sellers'] }) {
  return (
    <section className="ax-card" aria-labelledby="sellers-h">
      <div className="ax-card-head" style={{ justifyContent: 'flex-start' }}>
        <span className="ax-tile" aria-hidden="true">
          <Store size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="sellers-h" className="ax-h2">
            המתחרים שחוזרים
          </h2>
          <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
            מוכרים עם מודעות להשוואה מול המוצרים שלנו. לחיצה פותחת את כל המודעות שלהם ב-eBay
          </p>
        </div>
      </div>
      <div className="ax-rows">
        {sellers.map((s) => (
          <div key={s.seller} className="ax-kv" style={{ padding: '10px 14px' }}>
            <SellerLink seller={s.seller} />
            <span className="ax-muted" style={{ fontSize: 13 }}>
              <span className="ax-num">{num(s.products)}</span> מוצרים · <span className="ax-num">{num(s.offers)}</span> מודעות
              {s.cheaperThanUs > 0 && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--ax-warn)' }}>
                    זול מאיתנו ב-<span className="ax-num">{num(s.cheaperThanUs)}</span>
                  </span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function whyOut(o: OfferRow, group: string): string {
  if (o.manualMatch === false) return 'סומן: לא אותו מוצר'
  if (o.matchLevel === 'weak' && o.manualMatch !== true) return 'התאמה חלשה'
  if (o.conditionGroup !== group && o.manualMatch !== true) return `מצב אחר (${CONDITION_LABEL[o.conditionGroup as ConditionGroup] ?? o.conditionGroup})`
  if (o.price == null) return 'אין מחיר'
  if (o.currency !== 'USD') return `מטבע ${o.currency}`
  return 'מכירה פומבית בלבד'
}

function OffersDialog({ row, onClose, onChanged }: { row: PriceRow; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)
  /** d:<id> החלטה · c:<id> השוואה מעמיקה · all · check */
  const [busy, setBusy] = useState<string | null>(null)
  const { data, error, reload } = useLoad(() => api.get<{ offers: OfferRow[] }>(`/api/sync/pricing/${row.checkId}`), [row.checkId])

  const decide = async (o: OfferRow, match: boolean | null) => {
    setBusy(`d:${o.id}`)
    try {
      await api.post(`/api/sync/pricing/offers/${o.id}`, { match })
      await Promise.all([reload(), onChanged()])
      toast(match === true ? 'סומן כאותו מוצר — נכנס להשוואה' : match === false ? 'סומן כמוצר אחר — הוצא מההשוואה' : 'חזר לסיווג האוטומטי')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'bad')
    } finally {
      setBusy(null)
    }
  }

  const deepCompare = async (body: { offerIds: number[] } | { checkId: string }, key: string) => {
    setBusy(key)
    try {
      const r = await api.post<{ compared: number; errors: number; aiNote: string | null }>('/api/sync/pricing/compare', body)
      await Promise.all([reload(), onChanged()])
      toast(
        r.aiNote ? `הושוו ${num(r.compared)} מודעות · ${r.aiNote}` : r.errors ? `הושוו ${num(r.compared)} מודעות · ${num(r.errors)} נכשלו` : `הושוו ${num(r.compared)} מודעות`,
        r.errors || r.aiNote ? 'bad' : 'ok',
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ההשוואה נכשלה', 'bad')
    } finally {
      setBusy(null)
    }
  }

  const checkNow = async () => {
    setBusy('check')
    try {
      await api.post('/api/sync/pricing/check', { sku: row.sku, countries: [row.country] })
      toast('נבדק עכשיו מול eBay')
      await onChanged()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
      setBusy(null)
    }
  }

  const offers = data?.offers ?? []
  const relevant = offers.filter((o) => o.compared || o.matchLevel !== 'weak' || o.manualMatch !== null)
  const shown = showAll ? offers : relevant
  const hidden = offers.length - relevant.length
  const comparedCount = offers.filter((o) => o.compared).length

  return (
    <Modal
      title={row.title}
      onClose={onClose}
      maxWidth={860}
      foot={
        <>
          <button type="button" className="ax-btn" onClick={onClose}>
            סגירה
          </button>
          <button type="button" className="ax-btn is-primary" onClick={checkNow} disabled={busy !== null}>
            {busy === 'check' ? <Spin /> : <RefreshCw size={16} aria-hidden="true" />}
            בדיקה עכשיו מול eBay
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
          <bdi className="ax-num">{row.mpn}</bdi> · {CONDITION_LABEL[row.conditionGroup as ConditionGroup] ?? row.conditionGroup} · שלנו <Ours r={row} /> · קונה ב{countryName(row.country)} · נבדק{' '}
          <span className="ax-num">{dateTime(row.checkedAt)}</span>
        </p>
        {row.error && (
          <div className="ax-alert is-bad" role="alert">
            הבדיקה האחרונה נכשלה: {row.error}
          </div>
        )}

        {error ? (
          <LoadError error={error} retry={reload} />
        ) : !data ? (
          <div className="ax-skel" style={{ height: 200 }} />
        ) : offers.length === 0 ? (
          <p className="ax-note">eBay לא מצא אף מודעה אחרת עם מספר החלק הזה.</p>
        ) : (
          <>
            {comparedCount > 0 && (
              <div className="ax-inner" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="ax-muted" style={{ fontSize: 13, flex: '1 1 260px' }}>
                  השוואה מעמיקה קוראת את המודעה המלאה ב-eBay ומסבירה מה שונה מהמודעה שלנו ולמה יש פער מחיר.
                </span>
                <button type="button" className="ax-btn is-sm" onClick={() => deepCompare({ checkId: row.checkId }, 'all')} disabled={busy !== null}>
                  {busy === 'all' ? <Spin /> : <Sparkles size={15} aria-hidden="true" />}
                  {busy === 'all' ? 'משווה… (עד דקה)' : `השוואה מעמיקה ל-${num(Math.min(comparedCount, 12))} המודעות שבהשוואה`}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shown.map((o) => (
                <Offer
                  key={o.id}
                  o={o}
                  group={row.conditionGroup}
                  busy={busy === `d:${o.id}` || busy === `c:${o.id}`}
                  disabled={busy !== null}
                  onDecide={(m) => decide(o, m)}
                  onCompare={() => deepCompare({ offerIds: [o.id] }, `c:${o.id}`)}
                />
              ))}
            </div>
            {hidden > 0 && (
              <button type="button" className="ax-btn is-sm is-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'להסתיר התאמות חלשות' : `להציג גם ${num(hidden)} התאמות חלשות`}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function Offer({
  o,
  group,
  busy,
  disabled,
  onDecide,
  onCompare,
}: {
  o: OfferRow
  group: string
  busy: boolean
  disabled: boolean
  onDecide: (m: boolean | null) => void
  onCompare: () => void
}) {
  const total = o.price != null && o.shipping != null ? Number(o.price) + Number(o.shipping) : null
  return (
    <div className="ax-mcard" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 320px' }}>
          {o.url ? (
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ax-row-title ax-ltr"
              dir="ltr"
              aria-label={`${o.title} — המודעה ב-eBay (נפתח בחלון חדש)`}
              style={{ overflowWrap: 'anywhere', textAlign: 'right' }}
            >
              {o.title} <ExternalLink size={13} aria-hidden="true" />
            </a>
          ) : (
            <bdi className="ax-row-title">{o.title}</bdi>
          )}
          <span className="ax-muted" style={{ fontSize: 12.5 }}>
            {o.seller ? <SellerLink seller={o.seller} /> : 'מוכר לא ידוע'}
            {o.sellerFeedbackScore != null && (
              <>
                {' '}
                (<span className="ax-num">{num(o.sellerFeedbackScore)}</span> פידבקים)
              </>
            )}{' '}
            · שולח מ{countryName(o.country)} · {o.condition ?? CONDITION_LABEL[o.conditionGroup as ConditionGroup]}
          </span>
        </span>
        <span style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
          <span className="ax-num" style={{ fontWeight: 600, fontSize: 16 }}>
            {money(total ?? o.price, o.currency ?? 'USD')}
          </span>
          <span className="ax-muted" style={{ display: 'block', fontSize: 12 }}>
            {o.shipping != null ? (
              <>
                פריט <span className="ax-num">{money(o.price)}</span> + משלוח <span className="ax-num">{money(o.shipping)}</span>
              </>
            ) : (
              'משלוח לא ידוע'
            )}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill t={MATCH_LABEL[o.matchLevel][1]}>{MATCH_LABEL[o.matchLevel][0]}</Pill>
          {o.compared ? <Pill t="ok">בהשוואה</Pill> : <Pill t="gray">{whyOut(o, group)}</Pill>}
        </span>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {busy && <Spin />}
          <button type="button" className="ax-btn is-sm" disabled={disabled} onClick={onCompare}>
            <Sparkles size={15} aria-hidden="true" />
            {o.comparison ? 'השוואה מחדש' : 'השוואה מעמיקה'}
          </button>
          <button type="button" className="ax-btn is-sm" aria-pressed={o.manualMatch === true} disabled={disabled || o.manualMatch === true} onClick={() => onDecide(true)}>
            <Check size={15} aria-hidden="true" />
            אותו מוצר
          </button>
          <button type="button" className="ax-btn is-sm" aria-pressed={o.manualMatch === false} disabled={disabled || o.manualMatch === false} onClick={() => onDecide(false)}>
            <X size={15} aria-hidden="true" />
            לא אותו מוצר
          </button>
          {o.manualMatch !== null && (
            <button type="button" className="ax-btn is-sm is-ghost" disabled={disabled} onClick={() => onDecide(null)} aria-label="חזרה לסיווג האוטומטי">
              <RotateCcw size={15} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {o.comparison && <ComparisonView c={o.comparison} manualMatch={o.manualMatch} />}
    </div>
  )
}

const EFFECT_PILL: Record<Exclude<DiffEffect, 'neutral'>, [string, Tone, typeof ArrowDown]> = {
  lower: ['מוזיל אצלם', 'blue', ArrowDown],
  higher: ['מייקר אצלם', 'warn', ArrowUp],
}

/** תוצאת ההשוואה המעמיקה: האם זה אותו מוצר, למה יש פער, ומה שונה */
function ComparisonView({ c, manualMatch }: { c: OfferComparisonView; manualMatch: boolean | null }) {
  const [open, setOpen] = useState(false)
  const ai = c.ai
  // ההבדלים של Gemini (בעברית, כולל מה שנמצא בתיאור); בלי Gemini — של הכללים
  const diffs = ai?.differences?.length ? ai.differences.map((d) => ({ label: d.aspect, ours: d.ours, theirs: d.theirs, effect: d.effect })) : c.diffs
  const id = `cmp-${c.comparedAt}`
  if (c.error)
    return (
      <div className="ax-alert is-bad" role="alert" style={{ fontSize: 13 }}>
        ההשוואה המעמיקה נכשלה: {c.error}
      </div>
    )
  return (
    <div className="ax-inner" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Sparkles size={15} aria-hidden="true" style={{ color: 'var(--ax-accent-text)' }} />
        {ai && <Pill t={SAME_LABEL[ai.sameProduct]?.[1] ?? 'gray'}>{SAME_LABEL[ai.sameProduct]?.[0] ?? ai.sameProduct}</Pill>}
        {ai && <Pill t={JUSTIFIED_LABEL[ai.justified]?.[1] ?? 'gray'}>{JUSTIFIED_LABEL[ai.justified]?.[0] ?? ai.justified}</Pill>}
        {c.gapPct != null && (
          <span className="ax-muted" style={{ fontSize: 12.5 }}>
            מחיר פריט {signedPct(c.gapPct)} מאיתנו
          </span>
        )}
        <span className="ax-muted" style={{ fontSize: 12, marginInlineStart: 'auto' }}>
          {c.trigger === 'auto' ? 'הושווה אוטומטית' : 'הושווה'} <span className="ax-num">{date(c.comparedAt)}</span>
        </span>
      </div>
      {ai ? (
        <>
          <strong style={{ fontSize: 14 }}>{ai.headline}</strong>
          <p style={{ margin: 0, fontSize: 13.5 }}>{ai.explanation}</p>
          {ai.sameProduct !== 'same' && ai.sameProductReason && (
            <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
              {ai.sameProductReason}
              {(ai.sameProduct === 'different' || ai.sameProduct === 'variant') && manualMatch === null && ' — אם זה נכון, אפשר לסמן "לא אותו מוצר" כדי להוציא אותה מההשוואה.'}
            </p>
          )}
        </>
      ) : (
        <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
          {c.aiError ?? 'אין הסבר'} {diffs.length ? '' : '· לא נמצאו הבדלים לפי הכללים'}
        </p>
      )}
      {diffs.length > 0 && (
        <>
          <button type="button" className="ax-btn is-sm is-ghost" style={{ alignSelf: 'flex-start' }} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={15} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
            {open ? 'להסתיר את ההבדלים' : `פירוט ההבדלים (${num(diffs.length)})`}
          </button>
          {open && (
            <div id={id} className="ax-rows">
              {diffs.map((d, i) => {
                const pill = d.effect !== 'neutral' ? EFFECT_PILL[d.effect] : null
                const Icon = pill?.[2]
                return (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--ax-line)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>
                        <bdi>{d.label}</bdi>
                      </strong>
                      {pill && Icon && (
                        <Pill t={pill[1]}>
                          <Icon size={12} aria-hidden="true" />
                          {pill[0]}
                        </Pill>
                      )}
                    </span>
                    <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                      <span className="ax-muted">שלנו:</span> <bdi>{d.ours}</bdi>
                    </span>
                    <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                      <span className="ax-muted">שלהם:</span> <bdi>{d.theirs}</bdi>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
