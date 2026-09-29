'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { api, announceDataChanged, ApiError } from './api'
import { num } from './format'
import type { BackgroundRun, WooPlan, WooPlanItem, WooPushResult } from './types'
import { Modal, Pill, Spin, useToast } from './ui'

/**
 * שליחת המוצרים שנבחרו לחנות. קודם תצוגה מקדימה (קריאה בלבד — גם מול החנות),
 * ורק אחרי אישור: יצירה כטיוטות. מוצר שכבר קיים בחנות עם אותו SKU מקושר בלי שינוי.
 */
export function SendToStoreDialog({ productIds, onClose, onDone }: { productIds: string[]; onClose: () => void; onDone?: () => void }) {
  const toast = useToast()
  const [run, setRun] = useState<BackgroundRun | null>(null)
  const [plan, setPlan] = useState<WooPlan | null>(null)
  const [result, setResult] = useState<WooPushResult | null>(null)
  const [error, setError] = useState('')
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
    async (mode: 'preview' | 'create') => {
      setError('')
      const finish = (r: BackgroundRun) => {
        if (r.kind === 'woo-preview') return setPlan(r.result as WooPlan)
        const res = r.result as WooPushResult
        setResult(res)
        announceDataChanged()
        onDone?.()
        toast(res.failed.length ? `נוצרו ${num(res.created)} טיוטות, ${num(res.failed.length)} נכשלו — פרטים בלוג` : `נוצרו ${num(res.created)} טיוטות בחנות${res.linked ? `, ${num(res.linked)} קושרו` : ''}`, res.failed.length ? 'bad' : 'ok')
      }
      try {
        const { runId } = await api.post<{ runId: string }>('/api/sync/woo/products', { mode, productIds })
        poll(runId, finish)
      } catch (e) {
        // 409: כבר רצה שליחה/תצוגה מקדימה — מצטרפים אליה. ייבוא מ-eBay — מחכים שיסתיים.
        if (e instanceof ApiError && e.status === 409) {
          const current = await api.get<BackgroundRun>('/api/ebay/import').catch(() => null)
          if (current?.id && (current.kind === 'woo-preview' || current.kind === 'woo-create')) return poll(current.id, finish)
          return setError(current?.id ? 'כבר רץ ייבוא מ-eBay. נסה שוב כשהוא יסתיים' : 'הפעולה הקודמת הסתיימה הרגע — נסה שוב')
        }
        setError(e instanceof Error ? e.message : 'הפעולה נכשלה')
      }
    },
    [productIds, poll, toast, onDone],
  )

  // התצוגה המקדימה מתחילה פעם אחת בלבד (במצב פיתוח React מריץ effect פעמיים)
  const began = useRef(false)
  useEffect(() => {
    if (!began.current) {
      began.current = true
      void start('preview')
    }
  }, [start])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const running = run?.status === 'running'
  const creating = running && run?.kind === 'woo-create'
  const p = run?.progress
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0
  const actionable = plan ? plan.counts.create + plan.counts.link : 0
  const shown = result ?? plan

  const foot = result ? (
    <button type="button" className="ax-btn is-primary" onClick={onClose}>
      סגירה
    </button>
  ) : (
    <>
      <button type="button" className="ax-btn" onClick={onClose} disabled={creating}>
        ביטול
      </button>
      {error ? (
        <button type="button" className="ax-btn is-primary" onClick={() => start(plan ? 'create' : 'preview')}>
          נסה שוב
        </button>
      ) : (
        <button type="button" className="ax-btn is-primary" disabled={!plan || actionable === 0 || running} onClick={() => start('create')}>
          {creating && <Spin />}
          {creating ? 'שולח…' : plan && actionable === 0 ? 'אין מה לשלוח' : `שליחה לחנות${plan ? ` (${num(actionable)})` : ''}`}
        </button>
      )}
    </>
  )

  return (
    <Modal title="שליחת מוצרים לחנות" onClose={creating ? () => {} : onClose} foot={foot} maxWidth={620}>
      <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
        המוצרים נוצרים ב-WooCommerce <strong>כטיוטות</strong> — לא מוצגים לקונים עד שמפרסמים אותם. התמונה הראשית יורדת לחנות, שאר התמונות מוצגות מ-eBay. שום דבר לא משתנה ב-eBay.
      </p>

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
            {!p || p.phase === 'pages' ? 'בודק את המוצרים מול החנות…' : `שולח לחנות — ${num(p.done)} מתוך ${num(p.total)}`}
          </span>
          {p?.phase === 'writing' && (
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
                <Row label="נוצרו כטיוטות" value={num(result.created)} strong />
                {result.linked > 0 && <Row label="קושרו למוצר קיים בחנות" value={num(result.linked)} />}
                {result.failed.length > 0 && <Row label="נכשלו" value={num(result.failed.length)} bad />}
                {result.brandsCreated.length > 0 && <Row label="מותגים חדשים שנוספו לחנות" value={num(result.brandsCreated.length)} />}
              </>
            ) : (
              <>
                <Row label="ייווצרו כטיוטות" value={num(shown.counts.create)} strong />
                {shown.counts.link > 0 && <Row label="יקושרו למוצר קיים (אותו SKU)" value={num(shown.counts.link)} />}
                {shown.counts.skip > 0 && <Row label="ידולגו" value={num(shown.counts.skip)} warn />}
                {shown.newBrands.length > 0 && <Row label={`מותגים חדשים שיתווספו לחנות: ${shown.newBrands.join(', ')}`} value={num(shown.newBrands.length)} />}
              </>
            )}
          </div>
          <ItemList items={shown.items} failed={result?.failed} />
        </>
      ) : null}
    </Modal>
  )
}

const STATUS: Record<WooPlanItem['status'], [string, string, 'ok' | 'blue' | 'warn']> = {
  create: ['ייווצר', 'נוצר', 'ok'],
  link: ['יקושר', 'קושר', 'blue'],
  skip: ['ידולג', 'דולג', 'warn'],
}

/** רשימת המוצרים עם הסטטוס וההערות — כדי שיהיה ברור מה קורה לכל אחד */
function ItemList({ items, failed }: { items: WooPlanItem[]; failed?: WooPushResult['failed'] }) {
  const failedById = new Map((failed ?? []).map((f) => [f.productId, f.error]))
  return (
    <ul className="ax-inner" style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto' }} aria-label="המוצרים שנבחרו">
      {items.map((i) => {
        const err = failedById.get(i.productId)
        const [before, after, t] = STATUS[i.status]
        const [label, tone] = err ? ['נכשל', 'bad' as const] : [failed ? after : before, t]
        return (
          <li key={i.productId} className="ax-kv" style={{ padding: '10px 16px', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ minWidth: 0, color: 'var(--ax-text)' }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</span>
              {(err || i.notes.length > 0) && (
                <span className="ax-hint" style={{ display: 'block', color: err ? 'var(--ax-bad)' : undefined }}>
                  {err ?? i.notes.join(' · ')}
                </span>
              )}
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

function Row({ label, value, strong, warn, bad }: { label: string; value: string; strong?: boolean; warn?: boolean; bad?: boolean }) {
  return (
    <div className="ax-kv" style={{ padding: '10px 16px' }}>
      <span>{label}</span>
      <span className="ax-num" style={{ fontWeight: strong ? 700 : 600, color: bad ? 'var(--ax-bad)' : warn ? 'var(--ax-warn)' : undefined }}>
        {value}
      </span>
    </div>
  )
}
