'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, announceDataChanged, ApiError } from './api'
import { num, SKIP_REASON } from './format'
import type { BackgroundRun, ImportResult } from './types'
import { AlertCircle } from 'lucide-react'
import { Modal, Spin, useToast } from './ui'

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

  const foot = (
    <>
      <button type="button" className="ax-btn" onClick={onClose} disabled={importing}>
        {running && !importing ? 'סגירה (ממשיך ברקע)' : 'סגירה'}
      </button>
      {error ? (
        <button type="button" className="ax-btn is-primary" onClick={() => start('preview')}>
          נסה שוב
        </button>
      ) : (
        <button type="button" className="ax-btn is-primary" disabled={!preview || preview.created === 0 || running} onClick={() => start('import')}>
          {importing && <Spin />}
          {importing ? 'מייבא…' : preview && preview.created === 0 ? 'אין מוצרים חדשים' : `ייבוא ${preview ? num(preview.created) : ''} מוצרים`}
        </button>
      )}
    </>
  )

  return (
    <Modal title="ייבוא מוצרים מ-eBay" onClose={importing ? () => {} : onClose} foot={foot} maxWidth={560}>
      <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
        קריאה בלבד — שום דבר לא משתנה בחשבון eBay. נקראת רשימת המודעות הפעילות (SKU, כמות, כותרת, מחיר). מוצר חדש נכנס עם המלאי שיש לו ב-eBay; מוצר קיים לא משתנה.
      </p>

      {error ? (
        <div className="ax-alert is-bad" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : running || (!preview && !error) ? (
        <div className="ax-inner" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} role="status" aria-live="polite">
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ax-text2)' }}>
            <Spin size={18} />
            {!p
              ? 'מתחיל…'
              : p.phase === 'pages'
                ? `קורא מודעות מ-eBay — דף ${num(p.done)} מתוך ${num(p.total)}`
                : `שומר מוצרים — ${num(p.done)} מתוך ${num(p.total)}`}
          </span>
          <div className="ax-bar">
            <span style={{ width: `${pct}%`, transition: 'width 0.4s' }} />
          </div>
        </div>
      ) : preview ? (
        <div className="ax-inner">
          <Row label="מודעות פעילות ב-eBay" value={num(preview.totalOnEbay)} />
          <Row label="מוצרים חדשים שייובאו" value={num(preview.created)} strong />
          <Row label="כבר קיימים במערכת" value={num(preview.unchanged)} />
          {skippedByReason.map(([reason, n]) => (
            <Row key={reason} label={`ידולגו — ${SKIP_REASON[reason] ?? reason}`} value={num(n)} warn />
          ))}
          {preview.generatedSkus.length > 0 && <Row label="בלי SKU ב-eBay (יקבלו SKU פנימי EBAY-…)" value={num(preview.generatedSkus.length)} />}
          {preview.mismatches.length > 0 && <Row label="פערי כמות בין המערכת ל-eBay" value={num(preview.mismatches.length)} warn />}
          <Row label="קריאות ל-eBay בתצוגה המקדימה" value={num(preview.ebayCalls)} />
        </div>
      ) : null}
    </Modal>
  )
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="ax-kv" style={{ padding: '10px 16px' }}>
      <span>{label}</span>
      <span className="ax-num" style={{ fontWeight: strong ? 700 : 600, color: warn ? 'var(--ax-warn)' : undefined }}>
        {value}
      </span>
    </div>
  )
}
