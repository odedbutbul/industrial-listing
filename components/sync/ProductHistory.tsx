'use client'

import { AlertCircle, Check, Scale } from 'lucide-react'
import { ACTION_LABEL, dateTime, JOB_LABEL, LEDGER_REASON, LEDGER_SOURCE, num } from './format'
import type { ProductDetail } from './types'

/** היסטוריית המלאי (ledger) ולוג הסנכרון של מוצר — משותף לדף מוצר eBay ולדף מוצר ידני. */
export function ProductHistory({ ledger, log }: Pick<ProductDetail, 'ledger' | 'log'>) {
  return (
    <>
      <div className="ax-card">
        <div className="ax-card-head">
          <h2 className="ax-h2">היסטוריית מלאי</h2>
          <span className="ax-muted" style={{ fontSize: 12.5 }}>{num(ledger.length)} רשומות</span>
        </div>
        {ledger.length === 0 ? (
          <p className="ax-note">אין רשומות מלאי למוצר הזה.</p>
        ) : (
          <>
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>מתי</th>
                      <th>שינוי</th>
                      <th>סיבה</th>
                      <th>מקור</th>
                      <th>הזמנה</th>
                      <th>הערה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e) => (
                      <tr key={e.id}>
                        <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>{dateTime(e.createdAt)}</td>
                        <td>
                          <Delta n={e.delta} />
                        </td>
                        <td>{LEDGER_REASON[e.reason] ?? e.reason}</td>
                        <td>{LEDGER_SOURCE[e.source] ?? e.source}</td>
                        <td>
                          <span className="ax-num ax-ltr">{e.externalOrderId ?? '—'}</span>
                        </td>
                        <td style={{ color: 'var(--ax-text2)' }}>{e.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ax-only-mobile ax-mcards">
              {ledger.map((e) => (
                <div key={e.id} className="ax-mcard" style={{ gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>{LEDGER_REASON[e.reason] ?? e.reason}</span>
                    <Delta n={e.delta} />
                  </div>
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    <span className="ax-num">{dateTime(e.createdAt)}</span> · {LEDGER_SOURCE[e.source] ?? e.source}
                    {e.externalOrderId && (
                      <>
                        {' · '}
                        <span className="ax-num ax-ltr">{e.externalOrderId}</span>
                      </>
                    )}
                  </span>
                  {e.note && <span style={{ fontSize: 13, color: 'var(--ax-text2)' }}>{e.note}</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ax-card">
        <div className="ax-card-head">
          <h2 className="ax-h2">לוג המוצר</h2>
        </div>
        <div className="ax-rows">
          {log.length === 0 ? (
            <p className="ax-note">אין פעולות סנכרון רשומות למוצר הזה.</p>
          ) : (
            log.map((l) => (
              <div key={l.id} className="ax-row-btn">
                <span className={`ax-tile tone-${l.success ? 'ok' : l.action === 'qty_mismatch' ? 'warn' : 'bad'}`} aria-hidden="true">
                  {l.success ? <Check size={18} /> : l.action === 'qty_mismatch' ? <Scale size={18} /> : <AlertCircle size={18} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>
                    {JOB_LABEL[l.job] ?? l.job} · {ACTION_LABEL[l.action] ?? l.action}
                    <span className="ax-sr">{l.success ? ' — הצליח' : l.action === 'qty_mismatch' ? ' — פער' : ' — נכשל'}</span>
                  </span>
                  {l.error && l.action !== 'qty_mismatch' && <span style={{ fontSize: 12.5, color: 'var(--ax-bad)' }}>{l.error}</span>}
                </span>
                <span className="ax-muted ax-num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{dateTime(l.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

function Delta({ n }: { n: number }) {
  return (
    <span className="ax-num ax-ltr" style={{ fontWeight: 600, color: n > 0 ? 'var(--ax-ok)' : 'var(--ax-bad)' }}>
      {n > 0 ? `+${n}` : n}
    </span>
  )
}

