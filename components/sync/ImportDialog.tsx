'use client'

import { useEffect, useState } from 'react'
import { api, announceDataChanged } from './api'
import { num, SKIP_REASON } from './format'
import type { ImportResult } from './types'
import { Modal, tone, useToast } from './ui'

/**
 * ייבוא מ-eBay בשני שלבים: קודם dry-run שמראה מה ייובא (בלי לכתוב כלום),
 * ורק אחרי אישור — הייבוא עצמו. קריאה בלבד מול eBay בשני השלבים.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const loadPreview = () => {
    setError('')
    setPreview(null)
    api.post<ImportResult>('/api/ebay/import', { dryRun: true }).then(setPreview, (e: Error) => setError(e.message))
  }
  useEffect(loadPreview, [])

  const run = async () => {
    setRunning(true)
    try {
      const r = await api.post<ImportResult>('/api/ebay/import', { dryRun: false })
      toast(r.errors.length ? `יובאו ${num(r.created)} מוצרים, ${r.errors.length} נכשלו — פרטים בלוג` : `יובאו ${num(r.created)} מוצרים`, r.errors.length ? 'bad' : 'ok')
      announceDataChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הייבוא נכשל')
      setRunning(false)
    }
  }

  const skippedByReason = preview
    ? Object.entries(
        preview.skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {}),
      )
    : []

  return (
    <Modal label="ייבוא מוצרים מ-eBay" onClose={running ? () => {} : onClose} wide>
      <h2>ייבוא מוצרים מ-eBay</h2>
      <p>קריאה בלבד — שום דבר לא משתנה בחשבון eBay. מוצר חדש נכנס עם המלאי שיש לו ב-eBay; מוצר קיים לא משתנה.</p>

      {error ? (
        <div className="alert-box" style={tone('bad')} role="alert">
          <i className="ph-fill ph-warning-circle" />
          <span>{error}</span>
        </div>
      ) : !preview ? (
        <div className="inner" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)' }} role="status">
          <i className="ph ph-circle-notch spin" style={{ fontSize: 18 }} />
          בודק מה יש ב-eBay…
        </div>
      ) : (
        <div className="inner" style={{ display: 'flex', flexDirection: 'column' }}>
          <Row label="מודעות פעילות ב-eBay" value={num(preview.totalOnEbay)} />
          <Row label="מוצרים חדשים שייובאו" value={num(preview.created)} strong />
          <Row label="כבר קיימים במערכת" value={num(preview.unchanged)} />
          {skippedByReason.map(([reason, n]) => (
            <Row key={reason} label={`ידולגו — ${SKIP_REASON[reason] ?? reason}`} value={num(n)} tone="warn" />
          ))}
          {preview.generatedSkus.length > 0 && <Row label="בלי SKU ב-eBay (יקבלו SKU פנימי EBAY-…)" value={num(preview.generatedSkus.length)} />}
          {preview.mismatches.length > 0 && <Row label="פערי כמות בין המערכת ל-eBay" value={num(preview.mismatches.length)} tone="warn" />}
          {preview.errors.length > 0 && <Row label="מודעות שלא נקראו (שגיאה)" value={num(preview.errors.length)} tone="bad" last />}
        </div>
      )}

      <div className="row-actions">
        {error ? (
          <button type="button" className="btn primary" onClick={loadPreview}>
            נסה שוב
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!preview || preview.created === 0 || running} onClick={run}>
            {running && <i className="ph ph-circle-notch spin" />}
            {running ? 'מייבא…' : preview && preview.created === 0 ? 'אין מוצרים חדשים' : `ייבוא ${preview ? num(preview.created) : ''} מוצרים`}
          </button>
        )}
        <button type="button" className="btn" onClick={onClose} disabled={running}>
          סגירה
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
