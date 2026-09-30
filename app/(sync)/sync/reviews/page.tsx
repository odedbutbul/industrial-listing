'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ExternalLink, Eye, RefreshCw, Star } from 'lucide-react'
import { api } from '@/components/sync/api'
import { CardHead } from '@/components/sync/CardHead'
import { ago, date, dateTime, num, pct } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import { EmptyState, Kpi, LoadError, Pill, Seg, Spin, Switch, useLoad, useToast, type Tone } from '@/components/sync/ui'

type Filter = 'shown' | 'suggested' | 'positive' | 'neutral' | 'negative' | 'all'
const FILTERS: Filter[] = ['shown', 'suggested', 'positive', 'neutral', 'negative', 'all']

interface ReviewRow {
  id: string
  commentType: 'Positive' | 'Neutral' | 'Negative'
  commentText: string
  commentTime: string
  buyerMasked: string | null
  buyerScore: number | null
  itemId: string | null
  itemTitle: string | null
  response: string | null
  showOnSite: boolean
  productId: string | null
  sku: string | null
}

interface Summary {
  score: number | null
  positive12m: number | null
  neutral12m: number | null
  negative12m: number | null
  positivePct12m: number | null
  ratings: { key: string; rating: number; count: number | null }[]
  fetchedAt: string
  totalOnEbay: number
}

interface ReviewList {
  rows: ReviewRow[]
  nextOffset: number | null
  counts: Record<Filter, number> & { linked: number }
  summary: Summary | null
  seller: string | null
  profileUrl: string | null
}

interface PullResult {
  pages: number
  fetched: number
  created: number
  updated: number
  totalOnEbay: number
}

const TYPE: Record<ReviewRow['commentType'], [string, Tone]> = {
  Positive: ['חיובי', 'ok'],
  Neutral: ['ניטרלי', 'gray'],
  Negative: ['שלילי', 'bad'],
}

/** דירוגי המוכר המפורטים — שמות כפי שמוצגים ב-eBay */
const RATING_LABEL: Record<string, string> = {
  ItemAsDescribed: 'Accurate description',
  Communication: 'Communication',
  ShippingTime: 'Shipping speed',
  ShippingAndHandlingCharges: 'Shipping cost',
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="ax-skel" />}>
      <Reviews />
    </Suspense>
  )
}

function Reviews() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const filter = (FILTERS.includes(params.get('filter') as Filter) ? params.get('filter') : 'suggested') as Filter
  const [more, setMore] = useState<ReviewRow[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pulling, setPulling] = useState(false)
  /** בחירות שנשמרו במסך הזה — גוברות על מה שנטען (עד הטעינה הבאה) */
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const setFilter = (v: Filter) => {
    const sp = new URLSearchParams(params.toString())
    if (v !== 'suggested') sp.set('filter', v)
    else sp.delete('filter')
    router.replace(`${pathname}${sp.toString() ? '?' + sp.toString() : ''}`)
  }

  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<ReviewList>(`/api/sync/reviews?filter=${filter}`)
    setMore([])
    setShown({})
    setNextOffset(r.nextOffset)
    return r
  }, [filter])
  // התצוגה המקדימה תמיד מראה את מה שנבחר, בלי קשר לסינון
  const preview = useLoad(() => api.get<ReviewList>('/api/sync/reviews?filter=shown'), [])
  useDataChanged(reload)

  const loadMore = async () => {
    if (nextOffset === null) return
    setLoadingMore(true)
    try {
      const r = await api.get<ReviewList>(`/api/sync/reviews?filter=${filter}&offset=${nextOffset}`)
      setMore((m) => [...m, ...r.rows])
      setNextOffset(r.nextOffset)
    } finally {
      setLoadingMore(false)
    }
  }

  const pull = async () => {
    setPulling(true)
    try {
      const r = await api.post<PullResult>('/api/sync/reviews/pull')
      toast(r.created ? `נמשכו ${num(r.created)} ביקורות חדשות` : r.updated ? `${num(r.updated)} ביקורות עודכנו. אין חדשות` : 'אין ביקורות חדשות ב-eBay')
      await Promise.all([reload(), preview.reload()])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'המשיכה נכשלה', 'bad')
    } finally {
      setPulling(false)
    }
  }

  const toggle = async (r: ReviewRow, show: boolean) => {
    setSaving(r.id)
    setShown((s) => ({ ...s, [r.id]: show }))
    try {
      await api.post(`/api/sync/reviews/${r.id}`, { show })
      toast(show ? 'הביקורת תוצג באתר' : 'הביקורת הוסרה מהאתר')
      void preview.reload()
    } catch (e) {
      setShown((s) => ({ ...s, [r.id]: !show }))
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'bad')
    } finally {
      setSaving(null)
    }
  }

  const rows = data ? [...data.rows, ...more] : null
  const c = data?.counts
  const s = data?.summary
  const isOn = (r: ReviewRow) => shown[r.id] ?? r.showOnSite
  const sub = !data
    ? ' '
    : c!.all === 0
      ? 'עוד לא נמשכו ביקורות מ-eBay'
      : c!.shown
        ? `${num(c!.shown)} ביקורות מוצגות באתר${c!.suggested ? ` · ${num(c!.suggested)} מומלצות מחכות לבחירה` : ''}`
        : `אף ביקורת עוד לא נבחרה לאתר${c!.suggested ? ` · ${num(c!.suggested)} מומלצות מחכות לבחירה` : ''}`

  const pullButton = (
    <button type="button" className="ax-btn" onClick={pull} disabled={pulling}>
      {pulling ? <Spin /> : <RefreshCw size={18} aria-hidden="true" />}
      משיכה מ-eBay
    </button>
  )

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">ביקורות מ-eBay</h1>
          <p className="ax-sub">{sub}</p>
        </div>
        {pullButton}
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !data ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : c!.all === 0 ? (
        <EmptyState
          icon={Star}
          title="עוד אין ביקורות"
          text="המשיכה קוראת מ-eBay את הפידבק שקונים השאירו לחנות (קריאה בלבד, בלי לשנות דבר ב-eBay). אחר כך בוחרים כאן אילו ביקורות יופיעו באתר."
          action={pullButton}
        />
      ) : (
        <>
          <div className="ax-kpis">
            <Kpi label="ציון פידבק ב-eBay" value={s?.score != null ? num(s.score) : '—'} sub={s ? `עודכן ${ago(s.fetchedAt)}` : 'עוד לא נמשך'} />
            <Kpi
              label="חיובי ב-12 חודשים"
              value={s?.positivePct12m != null ? pct(s.positivePct12m / 100, 1) : '—'}
              sub={s ? `${num(s.positive12m ?? 0)} חיוביים · ${num(s.neutral12m ?? 0)} ניטרליים · ${num(s.negative12m ?? 0)} שליליים` : undefined}
            />
            <Kpi label="נמשכו למערכת" value={num(c!.all)} sub={s ? `מתוך ${num(s.totalOnEbay)} ב-eBay · ${num(c!.linked)} מקושרות למוצר` : undefined} />
            <Kpi label="מוצגות באתר" value={num(c!.shown)} sub={c!.suggested ? `${num(c!.suggested)} מומלצות לבחירה` : 'אין מומלצות שמחכות'} />
          </div>

          <SitePreview list={preview.data} summary={s ?? null} profileUrl={data.profileUrl} />

          <Seg
            label="סינון ביקורות"
            options={[
              ['suggested', 'מומלצות', c!.suggested],
              ['shown', 'באתר', c!.shown],
              ['positive', 'חיוביות', c!.positive],
              ['neutral', 'ניטרליות', c!.neutral],
              ['negative', 'שליליות', c!.negative],
              ['all', 'הכל', c!.all],
            ]}
            value={filter}
            onChange={setFilter}
          />

          {rows!.length === 0 ? (
            <div className="ax-card">
              <p className="ax-note">{filter === 'suggested' ? 'אין ביקורות מומלצות שמחכות לבחירה. כל ביקורת חיובית עם טקסט של 30 תווים ומעלה מופיעה כאן עד שמחליטים עליה.' : filter === 'shown' ? 'עוד לא נבחרה אף ביקורת לאתר. בחר מתוך "מומלצות".' : 'אין ביקורות שמתאימות לסינון.'}</p>
            </div>
          ) : (
            <section className="ax-card" aria-label="ביקורות">
              <div className="ax-only-desktop">
                <div className="ax-table-wrap">
                  <table className="ax-table" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>ביקורת</th>
                        <th>סוג</th>
                        <th>מוצר</th>
                        <th>תאריך</th>
                        <th>באתר</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows!.map((r) => (
                        <tr key={r.id}>
                          <td style={{ maxWidth: 380 }}>
                            <ReviewText r={r} />
                          </td>
                          <td>
                            <Pill t={TYPE[r.commentType][1]} dot>
                              {TYPE[r.commentType][0]}
                            </Pill>
                          </td>
                          <td style={{ maxWidth: 240 }}>
                            <Product r={r} />
                          </td>
                          <td className="ax-muted ax-num" style={{ whiteSpace: 'nowrap' }} title={dateTime(r.commentTime)}>
                            {date(r.commentTime)}
                          </td>
                          <td>
                            <ShowSwitch r={r} on={isOn(r)} busy={saving === r.id} onChange={(v) => toggle(r, v)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ax-only-mobile ax-mcards">
                {rows!.map((r) => (
                  <div key={r.id} className="ax-mcard" style={{ gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <Pill t={TYPE[r.commentType][1]} dot>
                        {TYPE[r.commentType][0]}
                      </Pill>
                      <span className="ax-muted ax-num" style={{ fontSize: 12.5 }}>
                        {date(r.commentTime)}
                      </span>
                    </div>
                    <ReviewText r={r} />
                    <Product r={r} />
                    <ShowSwitch r={r} on={isOn(r)} busy={saving === r.id} onChange={(v) => toggle(r, v)} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {nextOffset !== null && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת ביקורות קודמות
            </button>
          )}
        </>
      )}
    </>
  )
}

function ReviewText({ r }: { r: ReviewRow }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span dir="auto" lang="en" style={{ unicodeBidi: 'isolate', textAlign: 'start' }}>
        {r.commentText || <span className="ax-muted">(בלי טקסט)</span>}
      </span>
      <span className="ax-muted" style={{ fontSize: 12.5 }}>
        <bdi className="ax-ltr">
          {r.buyerMasked ?? 'קונה'}
          {r.buyerScore != null && <span className="ax-num"> ({num(r.buyerScore)})</span>}
        </bdi>
        {r.response && <> · יש תגובה של החנות</>}
      </span>
    </div>
  )
}

function Product({ r }: { r: ReviewRow }) {
  if (!r.itemTitle) return <span className="ax-muted">—</span>
  const title = (
    <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
      {r.itemTitle}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13.5 }}>
      {r.productId ? <Link href={`/sync/products/${r.productId}`}>{title}</Link> : title}
      <span className="ax-muted" style={{ fontSize: 12.5 }}>
        {r.productId ? (
          <>
            מק״ט <span className="ax-num ax-ltr">{r.sku}</span>
          </>
        ) : (
          'המודעה לא במערכת (נמכרה או נסגרה)'
        )}
      </span>
    </div>
  )
}

function ShowSwitch({ r, on, busy, onChange }: { r: ReviewRow; on: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  if (r.commentType !== 'Positive' || !r.commentText.trim()) {
    return (
      <span className="ax-muted" style={{ fontSize: 12.5 }}>
        {r.commentType !== 'Positive' ? 'רק חיוביות מוצגות' : 'אין טקסט'}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} aria-busy={busy}>
      <Switch on={on} onChange={(v) => !busy && onChange(v)}>
        <span className="ax-sr">הצגה באתר: </span>
        {on ? 'מוצגת' : 'לא מוצגת'}
      </Switch>
      {busy && <Spin size={14} />}
    </span>
  )
}

/**
 * תצוגה מקדימה של הבלוק באתר (אנגלית, LTR). תנאי ה-API של eBay דורשים שתוכן מ-eBay יוצג
 * בנפרד מתוכן אחר ויהיה ברור שהוא מ-eBay — לכן בלוק נפרד עם כותרת וקישור לעמוד הפידבק.
 */
function SitePreview({ list, summary, profileUrl }: { list: ReviewList | null; summary: Summary | null; profileUrl: string | null }) {
  const reviews = list?.rows.slice(0, 6) ?? []
  const total = summary ? (summary.positive12m ?? 0) + (summary.neutral12m ?? 0) + (summary.negative12m ?? 0) : null
  return (
    <section className="ax-card" aria-labelledby="preview-title" style={{ padding: 0 }}>
      <CardHead id="preview-title" icon={Eye} title="כך זה ייראה באתר" text="תצוגה מקדימה של בלוק הביקורות בחנות. מוצגות רק ביקורות שסימנת, עד 6 בבלוק." pill={<Pill t="gray">טיוטה · לא מחובר לאתר</Pill>} />
      <div style={{ padding: 'clamp(18px,3vw,28px)', paddingTop: 0 }}>
        <div className="ax-inner" dir="ltr" lang="en" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h3 className="ax-h2" style={{ margin: 0 }}>
                Reviews from our eBay store
              </h3>
              <p className="ax-muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                {summary?.positivePct12m != null ? (
                  <>
                    <span className="ax-num">{summary.positivePct12m}%</span> positive feedback · <span className="ax-num">{num(total ?? 0)}</span> ratings in the past 12 months
                  </>
                ) : (
                  'Verified buyers on eBay'
                )}
              </p>
            </div>
            {profileUrl && (
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                See all feedback on eBay <ExternalLink size={14} aria-hidden="true" />
                <span className="ax-sr"> (נפתח בחלון חדש)</span>
              </a>
            )}
          </div>
          {summary && summary.ratings.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {summary.ratings.map((x) => (
                <span key={x.key} className="ax-pill tone-gray">
                  {RATING_LABEL[x.key] ?? x.key} <span className="ax-num">{x.rating.toFixed(1)}</span>/5
                </span>
              ))}
            </div>
          )}
          {!list ? (
            <div className="ax-skel" style={{ height: 120 }} />
          ) : reviews.length === 0 ? (
            <p className="ax-muted" style={{ margin: 0 }} dir="rtl" lang="he">
              עוד לא נבחרו ביקורות. סמן &quot;מוצגת&quot; ליד ביקורות מהרשימה למטה, והן יופיעו כאן.
            </p>
          ) : (
            <div className="ax-grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
              {reviews.map((r) => (
                <figure key={r.id} className="ax-card" style={{ margin: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <blockquote style={{ margin: 0 }}>“{r.commentText}”</blockquote>
                  <figcaption className="ax-muted" style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>
                      {r.buyerMasked ?? 'eBay buyer'}
                      {r.buyerScore != null && <span className="ax-num"> ({num(r.buyerScore)})</span>} · <span className="ax-num">{new Date(r.commentTime).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    </span>
                    {r.itemTitle && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.itemTitle}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <p className="ax-muted" style={{ margin: 0, fontSize: 12 }}>
            Feedback left by buyers on eBay. Usernames are partially hidden.
          </p>
        </div>
      </div>
    </section>
  )
}
