'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { api, announceDataChanged, ApiError } from './api'
import { ago, dateTime, money, num } from './format'
import type { BackgroundRun, EbayPricesResult, ShippingSyncItem, ShippingSyncPlan, ShippingSyncResult } from './types'
import { Modal, Pill, Spin, useToast } from './ui'

/**
 * מחיר המוצר ומחירי המשלוח → המוצרים שכבר בחנות. קודם תצוגה מקדימה (קריאה בלבד מהחנות),
 * ורק אחרי אישור: עדכון המחיר ו/או שדות המשלוח שהשתנו. מלאי, תיאור ותמונות לא משתנים.
 * "משיכה עכשיו מ-eBay" מרענן את המחירים במערכת לפני התצוגה המקדימה (אחרת — מהמשיכה של הבוקר).
 */
export function ShippingToStoreDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [run, setRun] = useState<BackgroundRun | null>(null)
  const [plan, setPlan] = useState<ShippingSyncPlan | null>(null)
  const [result, setResult] = useState<ShippingSyncResult | null>(null)
  const [error, setError] = useState('')
  /** תוצאת "משיכה עכשיו מ-eBay" כשהייתה שגיאה — מוצג בחלון, בלי לשנות את כפתור העדכון */
  const [refreshError, setRefreshError] = useState('')
  const timer = useRef<number>(0)

  const poll = useCallback((runId: string, onFinish: (r: BackgroundRun) => void) => {
    window.clearTimeout(timer.current)
    const tick = async () => {
      try {
        const r = await api.get<BackgroundRun>(`/api/ebay/import?runId=${runId}`)
        setRun(r)
        if (r.status === 'running') timer.current = window.setTimeout(tick, 1500)
        else if (r.status === 'failed') setError(r.error ?? 'הפעולה נכשלה')
        else onFinish(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'אין חיבור לשרת')
      }
    }
    void tick()
  }, [])

  const start = useCallback(
    async function go(mode: 'refresh' | 'preview' | 'update'): Promise<void> {
      setError('')
      const finish = (r: BackgroundRun) => {
        if (r.kind === 'woo-shipping-preview') return setPlan(r.result as ShippingSyncPlan)
        if (r.kind === 'ebay-prices') {
          const e = r.result as EbayPricesResult
          setRefreshError(e.errors.length ? `המשיכה מ-eBay לא הושלמה (${e.errors[0].error}). המחירים שמוצגים — מהמשיכה הקודמת.` : '')
          toast(e.errors.length ? `המשיכה מ-eBay הסתיימה עם ${num(e.errors.length)} שגיאות — פרטים בלוג` : `נמשכו מ-eBay ${num(e.updated)} מוצרים · ${num(e.priceChanged)} מחירים השתנו`, e.errors.length ? 'bad' : 'ok')
          setPlan(null)
          return void go('preview')
        }
        const res = r.result as ShippingSyncResult
        setResult(res)
        announceDataChanged()
        toast(res.failed.length ? `עודכנו ${num(res.updated)} מוצרים, ${num(res.failed.length)} נכשלו — פרטים בלוג` : `עודכנו ${num(res.updated)} מוצרים בחנות`, res.failed.length ? 'bad' : 'ok')
      }
      try {
        const { runId } = await api.post<{ runId: string }>('/api/sync/woo/shipping', { mode })
        poll(runId, finish)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const current = await api.get<BackgroundRun>('/api/ebay/import').catch(() => null)
          if (current?.id && (current.kind === 'woo-shipping-preview' || current.kind === 'woo-shipping' || current.kind === 'ebay-prices')) return poll(current.id, finish)
          return setError(current?.id ? 'כבר רצה פעולה אחרת (ייבוא או שליחה לחנות). נסה שוב כשהיא תסתיים' : 'הפעולה הקודמת הסתיימה הרגע — נסה שוב')
        }
        setError(e instanceof Error ? e.message : 'הפעולה נכשלה')
      }
    },
    [poll, toast],
  )

  const began = useRef(false)
  useEffect(() => {
    if (!began.current) {
      began.current = true
      void start('preview')
    }
  }, [start])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const running = run?.status === 'running'
  const updating = running && run?.kind === 'woo-shipping'
  const refreshing = running && run?.kind === 'ebay-prices'
  const p = run?.progress
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0
  const shown = result ?? plan
  const toUpdate = plan?.counts.update ?? 0

  const foot = result ? (
    <button type="button" className="ax-btn is-primary" onClick={onClose}>
      סגירה
    </button>
  ) : (
    <>
      <button type="button" className="ax-btn" onClick={onClose} disabled={updating || refreshing}>
        ביטול
      </button>
      {error ? (
        <button type="button" className="ax-btn is-primary" onClick={() => start(plan ? 'update' : 'preview')}>
          נסה שוב
        </button>
      ) : (
        <button type="button" className="ax-btn is-primary" disabled={!plan || toUpdate === 0 || running} onClick={() => start('update')}>
          {updating && <Spin />}
          {updating ? 'מעדכן…' : plan && toUpdate === 0 ? 'הכל מעודכן' : `עדכון בחנות${plan ? ` (${num(toUpdate)})` : ''}`}
        </button>
      )}
    </>
  )

  const listed = (shown?.items ?? []).filter((i) => i.status !== 'same' || result?.failed.some((f) => f.productId === i.productId))

  return (
    <Modal title="מחירים ומשלוח למוצרים שבחנות" onClose={updating || refreshing ? () => {} : onClose} foot={foot} maxWidth={620}>
      <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
        מעדכן במוצרים שבחנות <strong>רק</strong> את מחיר המוצר ואת מחירי המשלוח (ארה״ב ושאר העולם), כמו ב-eBay — ורק מה שהשתנה. מלאי, תיאור ותמונות לא משתנים. שום דבר לא משתנה ב-eBay.
      </p>

      {refreshError && !result && (
        <div className="ax-alert is-warn" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{refreshError}</span>
        </div>
      )}

      {!result && (
        <div className="ax-inner" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="ax-hint" style={{ flex: '1 1 220px' }}>
            {plan?.lastEbayFetch ? (
              <>
                המחירים נמשכו מ-eBay <span title={dateTime(plan.lastEbayFetch)}>{ago(plan.lastEbayFetch)}</span>. משיכה אוטומטית כל בוקר.
              </>
            ) : (
              'המחירים נמשכים מ-eBay כל בוקר.'
            )}
          </span>
          <button type="button" className="ax-btn is-sm" disabled={running} onClick={() => start('refresh')}>
            {refreshing ? <Spin /> : <RefreshCw size={16} aria-hidden="true" />}
            {refreshing ? 'מושך מ-eBay…' : 'משיכה עכשיו מ-eBay'}
          </button>
        </div>
      )}

      {error && (
        <div className="ax-alert is-bad" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!error && (running || !shown) ? (
        <div className="ax-inner" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} role="status" aria-live="polite">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ax-text2)' }}>
            <Spin size={18} />
            {refreshing
              ? `קורא מחירים מ-eBay${p?.total ? ` — דף ${num(p.done)} מתוך ${num(p.total)}` : '…'} (כמה דקות)`
              : !p || p.phase === 'pages'
                ? `קורא את המוצרים מהחנות${p?.total ? ` — ${num(p.done)} מתוך ${num(p.total)}` : '…'}`
                : `מעדכן בחנות — ${num(p.done)} מתוך ${num(p.total)}`}
          </span>
          {p && p.total > 0 && (
            <div className="ax-bar">
              <span style={{ width: `${pct}%`, transition: 'width 0.4s' }} />
            </div>
          )}
        </div>
      ) : shown ? (
        <>
          <div className="ax-inner">
            {result ? (
              <>
                <Row label="עודכנו בחנות" value={num(result.updated)} strong />
                {result.failed.length > 0 && <Row label="נכשלו" value={num(result.failed.length)} tone="bad" />}
              </>
            ) : (
              <>
                <Row label="יתעדכנו" value={num(shown.counts.update)} strong />
                {shown.counts.update > 0 && <Row label="מתוכם: מחיר חדש · משלוח חדש" value={`${num(shown.changes.price)} · ${num(shown.changes.shipping)}`} />}
              </>
            )}
            {shown.counts.same > 0 && !result && <Row label="כבר מעודכנים" value={num(shown.counts.same)} />}
            {shown.counts.no_data > 0 && <Row label="אין מחירי משלוח מ-eBay והמחיר זהה (לא ישתנו)" value={num(shown.counts.no_data)} tone="warn" />}
            {shown.counts.missing > 0 && <Row label="לא נמצאו בחנות" value={num(shown.counts.missing)} tone="warn" />}
          </div>
          {listed.length > 0 && <ItemList items={listed} failed={result?.failed} done={!!result} />}
        </>
      ) : null}
    </Modal>
  )
}

/** "25.00" → $25 · "0" → חינם · "calculated" → מחושב · "" → — */
function shipValue(v: string | undefined) {
  if (!v) return '—'
  if (v === 'calculated') return 'מחושב'
  if (Number(v) === 0) return 'חינם'
  return money(v)
}

const STATUS: Record<ShippingSyncItem['status'], [string, string, 'ok' | 'blue' | 'warn' | 'gray']> = {
  update: ['יתעדכן', 'עודכן', 'ok'],
  same: ['מעודכן', 'מעודכן', 'gray'],
  no_data: ['אין נתונים', 'אין נתונים', 'warn'],
  missing: ['לא בחנות', 'לא בחנות', 'warn'],
}

function ItemList({ items, failed, done }: { items: ShippingSyncItem[]; failed?: ShippingSyncResult['failed']; done: boolean }) {
  const failedById = new Map((failed ?? []).map((f) => [f.productId, f.error]))
  return (
    <ul className="ax-inner" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto' }} aria-label="המוצרים">
      {items.map((i) => {
        const err = failedById.get(i.productId)
        const [before, after, t] = STATUS[i.status]
        const [label, tone] = err ? ['נכשל', 'bad' as const] : [done ? after : before, t]
        return (
          <li key={i.productId} className="ax-kv" style={{ padding: '10px 16px', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ minWidth: 0, color: 'var(--ax-text)' }}>
              <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{i.title}</span>
              <span className="ax-hint" style={{ display: 'block', color: err ? 'var(--ax-bad)' : undefined }}>
                {err ??
                  (i.price || (i.shipping && i.next) ? (
                    <>
                      {i.price && (
                        <span style={{ display: 'block' }}>
                          מחיר {money(i.price.current)} ← <b>{money(i.price.next)}</b>
                        </span>
                      )}
                      {i.shipping && i.next && (
                        <span style={{ display: 'block' }}>
                          {i.current?.us === i.next.us && i.current?.intl === i.next.intl ? (
                            <>משלוח ללא שינוי במחיר — פרטי השירותים יתעדכנו</>
                          ) : (
                            <>
                              ארה״ב {shipValue(i.current?.us)} ← <b>{shipValue(i.next.us)}</b> · עולם {shipValue(i.current?.intl)} ← <b>{shipValue(i.next.intl)}</b>
                            </>
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="ax-num ax-ltr">{i.sku}</span>
                  ))}
              </span>
            </span>
            <Pill t={tone} dot>
              {label}
            </Pill>
          </li>
        )
      })}
    </ul>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'warn' | 'bad' }) {
  return (
    <div className="ax-kv" style={{ padding: '10px 16px' }}>
      <span>{label}</span>
      <span className="ax-num" style={{ fontWeight: strong ? 700 : 600, color: tone ? `var(--ax-${tone})` : undefined }}>
        {value}
      </span>
    </div>
  )
}
