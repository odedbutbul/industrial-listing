'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, announceDataChanged, ApiError } from './api'
import { num, SKIP_REASON } from './format'
import type { BackgroundRun, ImportResult } from './types'
import { Modal, tone, useToast } from './ui'

/**
 * ייבוא מ-eBay בשני שלבים, שניהם ברקע בשרת (בקשה ארוכה נחתכת ע"י Cloudflare):
 * קודם תצוגה מקדימה (לא כותבת כלום), ורק אחרי אישור — הייבוא. קריאה בלבד מול eBay.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [run, setRun] = useState<BackgroundRun | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<number>(0)

  const poll = useCallback(
    (runId: string, onDone: (r: BackgroundRun) => void) => {
      window.clearTimeout(timer.current)
      const tick = async () => {
        try {
          const r = await api.get<BackgroundRun>(`/api/ebay/import?runId=${runId}`)
          setRun(r)
          if (r.status === 'running') timer.current = window.setTimeout(tick, 1500)
          else if (r.status === 'failed') setError(r.error ?? 'הפעולה נכשלה')
          else onDone(r)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'אין חיבור לשרת')
        }
      }
      void tick()
    },
    [],
  )

  const start = useCallback(
    async (mode: 'preview' | 'import') => {
      setError('')
      try {
        const { runId } = await api.post<{ runId: string }>('/api/ebay/import', { mode })
        poll(runId, (r) => {
          const result = r.result as ImportResult
          if (mode === 'preview') setPreview(result)
          else {
            toast(result.errors.length ? `יובאו ${num(result.created)} מוצרים, ${num(result.errors.length)} נכשלו — פרטים בלוג` : `יובאו ${num(result.created)} מוצרים`, result.errors.length ? 'bad' : 'ok')
            announceDataChanged()
            onClose()
          }
        })
      } catch (e) {
        // 409: כבר רצה פעולה — מצטרפים אליה במקום להתחיל חדשה
        if (e instanceof ApiError && e.status === 409) {
          const current = await api.get<BackgroundRun>('/api/ebay/import').catch(() => null)
          if (current?.id) {
            setError('')
            poll(current.id, (r) => (r.kind === 'import-preview' ? setPreview(r.result as ImportResult) : (announceDataChanged(), onClose())))
            return
          }
        }
        setError(e instanceof Error ? e.message : 'הפעולה נכשלה')
      }
    },
    [poll, toast, onClose],
  )

  useEffect(() => {
    void start('preview')
    return () => window.clearTimeout(timer.current)
  }, [start])

  const running = run?.status === 'running'
  const importing = running && run?.kind === 'import'
  const p = run?.progress
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0
  const skippedByReason = preview
    ? Object.entries(preview.skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {}))
    : []

  return (
    <Modal label="ייבוא מוצרים מ-eBay" onClose={importing ? () => {} : onClose} wide>
      <h2>ייבוא מוצרים מ-eBay</h2>
      <p>קריאה בלבד — שום דבר לא משתנה בחשבון eBay. נקראת רשימת המודעות הפעילות (SKU, כמות, כותרת, מחיר). מוצר חדש נכנס עם המלאי שיש לו ב-eBay; מוצר קיים לא משתנה.</p>

      {error ? (
        <div className="alert-box" style={tone('bad')} role="alert">
          <i className="ph-fill ph-warning-circle" />
          <span>{error}</span>
        </div>
      ) : running || (!preview && !error) ? (
        <div className="inner" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} role="status" aria-live="polite">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)' }}>
            <i className="ph ph-circle-notch spin" style={{ fontSize: 18 }} />
            {!p
              ? 'מתחיל…'
              : p.phase === 'pages'
                ? `קורא מודעות מ-eBay — דף ${num(p.done)} מתוך ${num(p.total)}`
                : `שומר מוצרים — ${num(p.done)} מתוך ${num(p.total)}`}
          </span>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--hover2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'var(--accent)', transition: 'width 0.4s' }} />
          </div>
        </div>
      ) : preview ? (
        <div className="inner" style={{ display: 'flex', flexDirection: 'column' }}>
          <Row label="מודעות פעילות ב-eBay" value={num(preview.totalOnEbay)} />
          <Row label="מוצרים חדשים שייובאו" value={num(preview.created)} strong />
          <Row label="כבר קיימים במערכת" value={num(preview.unchanged)} />
          {skippedByReason.map(([reason, n]) => (
            <Row key={reason} label={`ידולגו — ${SKIP_REASON[reason] ?? reason}`} value={num(n)} tone="warn" />
          ))}
          {preview.generatedSkus.length > 0 && <Row label="בלי SKU ב-eBay (יקבלו SKU פנימי EBAY-…)" value={num(preview.generatedSkus.length)} />}
          {preview.mismatches.length > 0 && <Row label="פערי כמות בין המערכת ל-eBay" value={num(preview.mismatches.length)} tone="warn" />}
          <Row label="קריאות ל-eBay בתצוגה המקדימה" value={num(preview.ebayCalls)} last />
        </div>
      ) : null}

      <div className="row-actions">
        {error ? (
          <button type="button" className="btn primary" onClick={() => start('preview')}>
            נסה שוב
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!preview || preview.created === 0 || running} onClick={() => start('import')}>
            {importing && <i className="ph ph-circle-notch spin" />}
            {importing ? 'מייבא…' : preview && preview.created === 0 ? 'אין מוצרים חדשים' : `ייבוא ${preview ? num(preview.created) : ''} מוצרים`}
          </button>
        )}
        <button type="button" className="btn" onClick={onClose} disabled={importing}>
          {running && !importing ? 'סגירה (ממשיך ברקע)' : 'סגירה'}
        </button>
      </div>
    </Modal>
  )
}

function Row({ label, value, strong, tone: t, last }: { label: string; value: string; strong?: boolean; tone?: 'warn' | 'bad'; last?: boolean }) {
  return (
    <div className="kv" style={last ? { borderBottom: 'none' } : undefined}>
      <span>{label}</span>
      <span className="mono" style={{ fontWeight: strong ? 700 : 600, color: t ? `var(--${t})` : undefined, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
