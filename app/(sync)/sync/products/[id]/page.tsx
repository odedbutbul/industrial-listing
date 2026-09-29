'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/components/sync/api'
import { ACTION_LABEL, ago, dateTime, JOB_LABEL, LEDGER_REASON, LEDGER_SOURCE, money, num, stockStatus, WOO_NOT_LINKED } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { ProductDetail } from '@/components/sync/types'
import { LoadError, Pill, useLoad } from '@/components/sync/ui'
import { AlertCircle, AlertTriangle, ArrowRight, Check, ExternalLink, Info, Scale } from 'lucide-react'

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useLoad(() => api.get<ProductDetail>(`/api/sync/products/${id}`), [id])
  useDataChanged(reload)

  const back = (
    <Link href="/sync/products" className="ax-back">
      <ArrowRight size={16} aria-hidden="true" />
      מוצרים
    </Link>
  )

  if (error)
    return (
      <>
        {back}
        <LoadError error={error} retry={reload} />
      </>
    )
  if (!data)
    return (
      <>
        {back}
        <div className="ax-skel" style={{ height: 60 }} />
        <div className="ax-skel" style={{ height: 260 }} />
      </>
    )

  const { product: p, mapping: m, ledger, log, available } = data
  const [stockLabel, stockTone] = stockStatus(available)
  const mismatch = !!m && m.lastEbayQty !== null && m.lastEbayQty !== available
  const ebayUrl = m?.ebayItemId ? `https://www.ebay.com/itm/${m.ebayItemId}` : null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {back}
        <div>
          <h1 className="ax-h1">{p.title}</h1>
          <p className="ax-sub">
            {num(available)} במלאי{m?.lastSyncedAt ? ` · נבדק מול eBay ${ago(m.lastSyncedAt)}` : ''}
          </p>
        </div>
      </div>

      {mismatch && (
        <div className="ax-alert is-warn" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            ב-eBay רשומה כמות <b className="ax-num">{num(m!.lastEbayQty!)}</b> ובמערכת <b className="ax-num">{num(available)}</b>. המערכת לא משנה את המלאי לבד — הפער ייבדק בבדיקת ההתאמה התקופתית.
          </span>
        </div>
      )}

      <div className="ax-grid-auto">
        <div className="ax-card">
          <div className="ax-card-head">
            <h2 className="ax-h2">פרטים</h2>
            <Pill t={stockTone} dot>
              {stockLabel}
            </Pill>
          </div>
          <div className="ax-kv">
            <span>SKU</span>
            <span className="ax-num ax-ltr">{m?.sku ?? '—'}</span>
          </div>
          <div className="ax-kv">
            <span>מודעת eBay</span>
            {ebayUrl ? (
              <a href={ebayUrl} target="_blank" rel="noopener noreferrer" className="ax-num ax-ltr" aria-label={`פתיחת המודעה ${m!.ebayItemId} ב-eBay בלשונית חדשה`}>
                {m!.ebayItemId} <ExternalLink size={14} aria-hidden="true" style={{ verticalAlign: -2 }} />
              </a>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="ax-kv">
            <span>WooCommerce</span>
            {m?.wooProductId ? <span className="ax-num ax-ltr">#{m.wooProductId}</span> : <Pill t={WOO_NOT_LINKED[1]}>{WOO_NOT_LINKED[0]}</Pill>}
          </div>
          <div className="ax-kv">
            <span>מחיר ב-eBay</span>
            <span className="ax-num">{money(p.price, p.currency)}</span>
          </div>
          <div className="ax-kv">
            <span>מצב</span>
            <span>{p.condition ?? '—'}</span>
          </div>
          <div className="ax-kv">
            <span>מותג · MPN</span>
            <span>
              {p.brand ?? '—'} · <span className="ax-num ax-ltr">{p.mpn ?? '—'}</span>
            </span>
          </div>
          <div className="ax-kv">
            <span>קטגוריה</span>
            <span>{p.ebayCategoryName ?? p.ebayCategoryId ?? '—'}</span>
          </div>
        </div>

        <div className="ax-card ax-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 className="ax-h2">מלאי</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="ax-inner" style={{ flex: 1, minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="ax-kpi-label">במערכת</span>
              <span className="ax-kpi-value">
                {num(available)}
              </span>
            </div>
            <div className="ax-inner" style={{ flex: 1, minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="ax-kpi-label">ב-eBay</span>
              <span className="ax-kpi-value" style={{ color: mismatch ? 'var(--ax-warn)' : undefined }}>
                {m?.lastEbayQty === null || m?.lastEbayQty === undefined ? '—' : num(m.lastEbayQty)}
              </span>
            </div>
            <div className="ax-inner" style={{ flex: 1, minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="ax-kpi-label">באתר</span>
              <span className="ax-kpi-value">
                {m?.lastWooQty === null || m?.lastWooQty === undefined ? '—' : num(m.lastWooQty)}
              </span>
            </div>
          </div>
          {p.images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {p.images.slice(0, 24).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`תמונה ${i + 1} של ${p.title}`} width={72} height={72} loading="lazy" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0, boxShadow: 'var(--ax-ring)' }} />
              ))}
            </div>
          )}
        </div>
      </div>

      <FullDetails p={p} />

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

/** פרטים מלאים מ-GetItem (שלב 2). לפני שנמשכו — הודעה קצרה במקום הכרטיסים. */
function FullDetails({ p }: { p: ProductDetail['product'] }) {
  if (!p.detailsFetchedAt)
    return (
      <div className="ax-alert tone-gray">
        <Info size={18} aria-hidden="true" />
        <span>לפריט הזה נמשכו עד עכשיו רק פרטי הרשימה (SKU, כמות, כותרת, מחיר, תמונה ראשית). התיאור, כל התמונות והמפרט ייקראו בשלב הפרטים המלאים.</span>
      </div>
    )

  const specifics = Object.entries(p.itemSpecifics ?? {})
  const s = p.shipping
  const weight = s && (s.weightMajor || s.weightMinor) ? `${s.weightMajor ?? 0} ${s.weightUnit === 'kg' ? 'ק״ג' : s.weightUnit ?? ''} ${s.weightMinor ? `+ ${s.weightMinor}` : ''}`.trim() : null
  const dims = s && (s.length || s.width || s.depth) ? `${s.length ?? '—'} × ${s.width ?? '—'} × ${s.depth ?? '—'} ${s.dimensionUnit ?? ''}`.trim() : null
  // תיאור eBay הוא HTML חיצוני: מוצג במסגרת מבודדת (sandbox בלי סקריפטים), על רקע לבן כמו ב-eBay
  const doc = p.description
    ? `<!doctype html><meta charset="utf-8"><base target="_blank"><style>:root{color-scheme:light}body{margin:16px;font:14px/1.5 system-ui,sans-serif;color:#1c1512;background:#fff}img{max-width:100%;height:auto}</style>${p.description}`
    : null

  return (
    <>
      <div className="ax-grid-auto">
        <div className="ax-card">
          <div className="ax-card-head">
            <h2 className="ax-h2">מפרט מ-eBay</h2>
            <span className="ax-muted" style={{ fontSize: 12.5 }}>{specifics.length} שדות</span>
          </div>
          {specifics.length === 0 ? (
            <p className="ax-note">אין מפרט במודעה.</p>
          ) : (
            specifics.map(([name, values]) => (
              <div key={name} className="ax-kv">
                <span className="ax-ltr" style={{ textAlign: 'start' }}>{name}</span>
                <span className="ax-ltr" style={{ textAlign: 'end' }}>{values.join(', ')}</span>
              </div>
            ))
          )}
        </div>

        <div className="ax-card">
          <div className="ax-card-head">
            <h2 className="ax-h2">פרטי מודעה ומשלוח</h2>
          </div>
          {p.subtitle && (
            <div className="ax-kv">
              <span>כותרת משנה</span>
              <span className="ax-ltr">{p.subtitle}</span>
            </div>
          )}
          <div className="ax-kv">
            <span>מצב</span>
            <span>{[p.condition, p.conditionId && `(${p.conditionId})`].filter(Boolean).join(' ') || '—'}</span>
          </div>
          {p.conditionDescription && (
            <div className="ax-kv">
              <span>תיאור המצב</span>
              <span className="ax-ltr" style={{ textAlign: 'end' }}>{p.conditionDescription}</span>
            </div>
          )}
          <div className="ax-kv">
            <span>משקל</span>
            <span className="ax-num ax-ltr">{weight ?? '—'}</span>
          </div>
          <div className="ax-kv">
            <span>מידות אריזה</span>
            <span className="ax-num ax-ltr">{dims ?? '—'}</span>
          </div>
          <div className="ax-kv">
            <span>מיקום הפריט</span>
            <span className="ax-ltr">{[p.location, p.country].filter(Boolean).join(', ') || '—'}</span>
          </div>
          <div className="ax-kv">
            <span>המודעה עלתה</span>
            <span className="ax-num">{dateTime(p.ebayListingStartedAt)}</span>
          </div>
          <div className="ax-kv">
            <span>פרטים נמשכו</span>
            <span className="ax-num">{dateTime(p.detailsFetchedAt)}</span>
          </div>
        </div>
      </div>

      <div className="ax-card">
        <div className="ax-card-head">
          <h2 className="ax-h2">תיאור המוצר</h2>
          <span className="ax-muted" style={{ fontSize: 12.5 }}>כפי שמופיע ב-eBay</span>
        </div>
        {doc ? (
          <div style={{ padding: 12 }}>
            <iframe title={`תיאור המוצר ${p.title}`} sandbox="allow-popups" srcDoc={doc} loading="lazy" style={{ width: '100%', height: 520, border: 'none', borderRadius: 14, boxShadow: 'var(--ax-ring)' }} />
          </div>
        ) : (
          <p className="ax-note">אין תיאור במודעה.</p>
        )}
      </div>
    </>
  )
}
