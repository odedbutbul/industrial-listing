'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, ExternalLink, RotateCcw, Search, X } from 'lucide-react'
import type { QuoteOffer, QuoteResult } from '@/lib/pricing/quote'
import { CONDITION_LABEL, priceStats, type ConditionGroup, type Position, type QuoteCondition } from '@/lib/pricing/match'
import { api } from '@/components/sync/api'
import { dateTime, money, num } from '@/components/sync/format'
import { Field, Kpi, Pill, Spin, type Tone } from '@/components/sync/ui'

// בדיקת הצעת לקוח: מספר חלק + מחיר מוצע → איפה ההצעה עומדת מול המחירים שמוכרים אחרים מבקשים ב-eBay,
// ומול המחיר שלנו אם החלק בקטלוג. כל בדיקה = חיפוש אחד ב-eBay (קריאה בלבד). לא נשמר דבר.
// אפשר לפתוח עם פרטים ממולאים: ?mpn=&brand=&condition= (למשל מליד).

const CONDITIONS: [QuoteCondition, string][] = [
  ['any', 'כל מצב'],
  ['new', 'חדש'],
  ['refurbished', 'מחודש'],
  ['used', 'משומש'],
  ['parts', 'לחלקים'],
]

const COUNTRIES: [string, string][] = [
  ['US', 'ארה״ב'],
  ['GB', 'בריטניה'],
  ['DE', 'גרמניה'],
  ['AU', 'אוסטרליה'],
  ['CA', 'קנדה'],
  ['IL', 'ישראל'],
]

/** איפה ההצעה של הלקוח עומדת מול מחירי השוק */
const VERDICT: Record<Position, [string, Tone]> = {
  cheapest: ['נמוכה מכל מחיר בשוק', 'bad'],
  below_median: ['מתחת לחציון השוק', 'warn'],
  at_median: ['בגובה השוק (±5%)', 'ok'],
  above_median: ['מעל החציון', 'ok'],
  most_expensive: ['גבוהה מכל מחיר בשוק', 'ok'],
  only_us: ['אין מחירים להשוואה', 'gray'],
  no_price: ['לא הוזן מחיר מוצע', 'gray'],
}

const MATCH: Record<QuoteOffer['matchLevel'], [string, Tone]> = {
  exact: ['התאמה מלאה', 'ok'],
  likely: ['התאמה סבירה', 'blue'],
  weak: ['התאמה חלשה', 'gray'],
}

const countryName = (c: string | null) => COUNTRIES.find(([k]) => k === c)?.[1] ?? c ?? '—'

function signedPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const r = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10
  return `⁦${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%⁩`
}

export default function QuotePage() {
  return (
    <Suspense fallback={<div className="ax-skel" style={{ height: 320 }} />}>
      <Quote />
    </Suspense>
  )
}

function Quote() {
  const params = useSearchParams()
  const cond = CONDITIONS.find(([k]) => k === params.get('condition'))?.[0] ?? 'any'
  const [form, setForm] = useState({ mpn: params.get('mpn') ?? '', brand: params.get('brand') ?? '', condition: cond as QuoteCondition, offer: '', country: 'US' })
  const [errors, setErrors] = useState<{ mpn?: string; offer?: string }>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const resultRef = useRef<HTMLHeadingElement>(null)
  const offerRef = useRef<HTMLInputElement>(null)

  // תוצאה חדשה — הפוקוס עובר לכותרת התוצאה (קורא מסך מקריא אותה)
  useEffect(() => {
    if (result) resultRef.current?.focus()
  }, [result])

  // הגיע עם מספר חלק (מליד) — הפוקוס עובר למחיר המוצע
  useEffect(() => {
    if (params.get('mpn')) offerRef.current?.focus()
  }, [params])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    const compact = form.mpn.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (compact.length < 4 || !/[0-9]/.test(compact)) errs.mpn = 'מספר חלק של לפחות 4 תווים עם ספרה אחת לפחות'
    if (form.offer.trim() && !(Number(form.offer) > 0)) errs.offer = 'מספר חיובי בדולרים, למשל 450'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    setFailure('')
    try {
      const r = await api.post<QuoteResult>('/api/sync/pricing/quote', { ...form, offer: form.offer.trim() ? Number(form.offer) : null })
      setResult(r)
      setExcluded(new Set())
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'הבדיקה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/sync/pricing" className="ax-back">
          <ArrowRight size={16} aria-hidden="true" />
          מחירים מול מתחרים
        </Link>
        <div className="ax-page-head">
          <div>
            <h1 className="ax-h1">בדיקת הצעת לקוח</h1>
            <p className="ax-sub">מספר חלק ומחיר מוצע — ונראה איפה ההצעה עומדת מול מה שמוכרים אחרים מבקשים ב-eBay</p>
          </div>
        </div>
      </div>

      <form className="ax-card" onSubmit={submit} noValidate aria-label="פרטי ההצעה">
        <div className="ax-grid-2" style={{ padding: 'clamp(18px,3vw,28px)' }}>
          <Field id="q-mpn" label="מספר חלק" error={errors.mpn} hint="כמו שמופיע על החלק או בבקשה">
            <input
              id="q-mpn"
              className="ax-input ax-ltr"
              dir="ltr"
              value={form.mpn}
              onChange={(e) => setForm((f) => ({ ...f, mpn: e.target.value }))}
              aria-invalid={!!errors.mpn}
              aria-describedby={errors.mpn ? 'q-mpn-err' : 'q-mpn-hint'}
              autoComplete="off"
              required
            />
          </Field>
          <Field id="q-brand" label="יצרן (לא חובה)" hint="משפר את ההתאמה כשמספר החלק קצר">
            <input id="q-brand" className="ax-input ax-ltr" dir="ltr" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} aria-describedby="q-brand-hint" autoComplete="off" />
          </Field>
          <Field id="q-offer" label="המחיר שהלקוח מציע ($, לא חובה)" error={errors.offer} hint="בלי מחיר — רק מראה את השוק">
            <input
              id="q-offer"
              ref={offerRef}
              className="ax-input ax-ltr"
              dir="ltr"
              inputMode="decimal"
              value={form.offer}
              onChange={(e) => setForm((f) => ({ ...f, offer: e.target.value }))}
              aria-invalid={!!errors.offer}
              aria-describedby={errors.offer ? 'q-offer-err' : 'q-offer-hint'}
              autoComplete="off"
            />
          </Field>
          <Field id="q-cond" label="מצב החלק">
            <select id="q-cond" className="ax-select" value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value as QuoteCondition }))}>
              {CONDITIONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field id="q-country" label="מדינת הקונה" hint="לפי זה eBay מחשב משלוח ומסנן מודעות ששולחות לשם">
            <select id="q-country" className="ax-select" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} aria-describedby="q-country-hint">
              {COUNTRIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="ax-btn is-primary" disabled={busy}>
              {busy ? <Spin /> : <Search size={18} aria-hidden="true" />}
              בדיקה מול eBay
            </button>
          </div>
        </div>
      </form>

      {failure && (
        <div className="ax-alert is-bad" role="alert">
          {failure}
        </div>
      )}

      {busy && !result && <div className="ax-skel" style={{ height: 240 }} />}

      {result && <Result r={result} excluded={excluded} setExcluded={setExcluded} headingRef={resultRef} />}
    </>
  )
}

function Result({
  r,
  excluded,
  setExcluded,
  headingRef,
}: {
  r: QuoteResult
  excluded: Set<string>
  setExcluded: (s: Set<string>) => void
  headingRef: React.RefObject<HTMLHeadingElement>
}) {
  const [showAll, setShowAll] = useState(false)
  // "לא אותו מוצר" מוציא מודעה מהחישוב כאן, בלי לשמור
  const compared = useMemo(() => r.offers.filter((o) => o.compared && !excluded.has(o.itemId)), [r.offers, excluded])
  const stats = useMemo(() => priceStats(r.offer, compared.map((o) => o.price!)), [r.offer, compared])
  const ours = r.ours[0] ?? null
  const verdict = VERDICT[stats.position]
  const relevant = r.offers.filter((o) => o.compared || o.matchLevel !== 'weak')
  const shown = showAll ? r.offers : relevant
  const toggle = (id: string) => {
    const s = new Set(excluded)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setExcluded(s)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }} aria-labelledby="quote-result-h">
      <div className="ax-card" style={{ padding: 'clamp(18px,3vw,28px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 id="quote-result-h" ref={headingRef} tabIndex={-1} className="ax-h2" style={{ outline: 'none' }}>
          <bdi className="ax-num">{r.mpn}</bdi> · {r.condition === 'any' ? 'כל מצב' : CONDITION_LABEL[r.condition]} · קונה ב{countryName(r.country)}
        </h2>
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Pill t={verdict[1]} dot>
            {verdict[0]}
          </Pill>
          <span>
            {r.offer != null && stats.median != null ? (
              <>
                ההצעה <span className="ax-num">{money(r.offer)}</span> — {signedPct(stats.vsMedianPct)} מהחציון, {signedPct(stats.vsMinPct)} מהזול בשוק
                {stats.cheaperCount > 0 && (
                  <>
                    {' '}
                    · <span className="ax-num">{num(stats.cheaperCount)}</span> מתוך <span className="ax-num">{num(stats.count)}</span> מוכרים מבקשים פחות
                  </>
                )}
              </>
            ) : stats.count === 0 ? (
              r.totalResults ? 'eBay מצא מודעות, אבל אף אחת לא מתאימה בוודאות. אפשר לעבור עליהן למטה.' : 'eBay לא מצא אף מודעה עם מספר החלק הזה.'
            ) : (
              'בלי מחיר מוצע — אלה המחירים בשוק.'
            )}
          </span>
        </div>
        <p className="ax-muted" style={{ margin: 0, fontSize: 12.5 }}>
          ההשוואה על מחיר הפריט בלבד (בלי משלוח), מול מודעות קנייה מיידית. נבדק <span className="ax-num">{dateTime(r.checkedAt)}</span>
        </p>
      </div>

      <div className="ax-kpis">
        <Kpi label="ההצעה" value={money(r.offer)} sub={r.vsOursPct != null ? `${signedPct(r.vsOursPct)} מהמחיר שלנו` : undefined} />
        <Kpi label="הזול בשוק" value={money(stats.min)} sub={stats.count ? `${num(stats.count)} מודעות בהשוואה` : 'אין מודעות להשוואה'} />
        <Kpi label="חציון השוק" value={money(stats.median)} sub={stats.max != null ? `הכי יקר ${money(stats.max)}` : undefined} />
        <Kpi label="המחיר שלנו" value={money(ours?.price)} sub={ours ? 'החלק בקטלוג' : 'החלק לא בקטלוג'} />
      </div>

      {r.ours.length > 0 && (
        <div className="ax-card">
          <div className="ax-card-head">
            <h3 className="ax-h2">אצלנו בקטלוג</h3>
          </div>
          <div className="ax-rows">
            {r.ours.map((o) => (
              <div key={o.productId} className="ax-kv" style={{ padding: '10px 14px' }}>
                <Link href={`/sync/products/${o.productId}`} className="ax-row-title" style={{ overflowWrap: 'anywhere' }}>
                  {o.title}
                </Link>
                <span className="ax-muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  {CONDITION_LABEL[o.conditionGroup]} · <span className="ax-num">{money(o.price)}</span> · מק״ט <bdi className="ax-num">{o.sku}</bdi>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.offers.length > 0 && (
        <div className="ax-card">
          <div className="ax-card-head">
            <h3 className="ax-h2">המודעות ב-eBay</h3>
            <span className="ax-muted" style={{ fontSize: 13 }}>
              <span className="ax-num">{num(r.totalResults)}</span> תוצאות · <span className="ax-num">{num(compared.length)}</span> בהשוואה
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 clamp(12px,2vw,20px) 20px' }}>
            {shown.map((o) => (
              <OfferCard key={o.itemId} o={o} out={excluded.has(o.itemId)} onToggle={() => toggle(o.itemId)} />
            ))}
            {r.offers.length > relevant.length && (
              <button type="button" className="ax-btn is-sm is-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'להסתיר התאמות חלשות' : `להציג גם ${num(r.offers.length - relevant.length)} התאמות חלשות`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function OfferCard({ o, out, onToggle }: { o: QuoteOffer; out: boolean; onToggle: () => void }) {
  return (
    <div className="ax-mcard" style={{ gap: 8, opacity: out ? 0.6 : 1 }}>
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
            {o.seller && o.sellerUrl ? (
              <a href={o.sellerUrl} target="_blank" rel="noopener noreferrer" className="ax-ltr" dir="ltr" aria-label={`${o.seller} — כל המודעות של המוכר ב-eBay (נפתח בחלון חדש)`}>
                {o.seller} <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : (
              'מוכר לא ידוע'
            )}{' '}
            · שולח מ{countryName(o.country)} · {o.condition ?? CONDITION_LABEL[o.conditionGroup as ConditionGroup]}
          </span>
        </span>
        <span style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
          <span className="ax-num" style={{ fontWeight: 600, fontSize: 16 }}>
            {money(o.price)}
          </span>
          <span className="ax-muted" style={{ display: 'block', fontSize: 12 }}>
            {o.shipping != null ? (
              <>
                + משלוח <span className="ax-num">{money(o.shipping)}</span>
              </>
            ) : (
              'משלוח לא ידוע'
            )}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill t={MATCH[o.matchLevel][1]}>{MATCH[o.matchLevel][0]}</Pill>
          {out ? <Pill t="gray">הוצא מהחישוב</Pill> : o.compared ? <Pill t="ok">בהשוואה</Pill> : <Pill t="gray">{o.excludeReason ?? 'לא בהשוואה'}</Pill>}
        </span>
        {o.compared && (
          <button type="button" className="ax-btn is-sm" onClick={onToggle} aria-pressed={out}>
            {out ? <RotateCcw size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
            {out ? 'להחזיר לחישוב' : 'לא אותו מוצר'}
          </button>
        )}
      </div>
    </div>
  )
}
