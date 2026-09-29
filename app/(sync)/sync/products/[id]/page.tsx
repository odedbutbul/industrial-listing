'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/components/sync/api'
import { ACTION_LABEL, ago, dateTime, JOB_LABEL, LEDGER_REASON, LEDGER_SOURCE, money, num, stockStatus, WOO_NOT_LINKED } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { ProductDetail } from '@/components/sync/types'
import { Badge, LoadError, tone, useLoad } from '@/components/sync/ui'

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useLoad(() => api.get<ProductDetail>(`/api/sync/products/${id}`), [id])
  useDataChanged(reload)

  const back = (
    <Link href="/sync/products" className="back" style={{ textDecoration: 'none' }}>
      <i className="ph ph-arrow-right" />
      מוצרים
    </Link>
  )

  if (error)
    return (
      <section className="section">
        {back}
        <LoadError error={error} retry={reload} />
      </section>
    )
  if (!data)
    return (
      <section className="section">
        {back}
        <div className="skeleton" style={{ height: 60 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </section>
    )

  const { product: p, mapping: m, ledger, log, available } = data
  const [stockLabel, stockTone] = stockStatus(available)
  const mismatch = !!m && m.lastEbayQty !== null && m.lastEbayQty !== available
  const ebayUrl = m?.ebayItemId ? `https://www.ebay.com/itm/${m.ebayItemId}` : null

  return (
    <section className="section" style={{ gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {back}
        <div>
          <h1 className="h1">{p.title}</h1>
          <p className="sub">
            {num(available)} במלאי{m?.lastSyncedAt ? ` · נבדק מול eBay ${ago(m.lastSyncedAt)}` : ''}
          </p>
        </div>
      </div>

      {mismatch && (
        <div className="alert-box" style={tone('warn')} role="status">
          <i className="ph-fill ph-warning" />
          <span>
            ב-eBay רשומה כמות <b className="mono">{num(m!.lastEbayQty!)}</b> ובמערכת <b className="mono">{num(available)}</b>. המערכת לא משנה את המלאי לבד — הפער ייבדק בבדיקת ההתאמה התקופתית.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <h2 className="h2">פרטים</h2>
            <Badge t={stockTone} dot>
              {stockLabel}
            </Badge>
          </div>
          <div className="kv">
            <span>SKU</span>
            <span className="mono ltr">{m?.sku ?? '—'}</span>
          </div>
          <div className="kv">
            <span>מודעת eBay</span>
            {ebayUrl ? (
              <a href={ebayUrl} target="_blank" rel="noopener noreferrer" className="mono ltr" aria-label={`פתיחת המודעה ${m!.ebayItemId} ב-eBay בלשונית חדשה`}>
                {m!.ebayItemId} <i className="ph ph-arrow-square-out" aria-hidden="true" />
              </a>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="kv">
            <span>WooCommerce</span>
            {m?.wooProductId ? <span className="mono ltr">#{m.wooProductId}</span> : <Badge t={WOO_NOT_LINKED[1]}>{WOO_NOT_LINKED[0]}</Badge>}
          </div>
          <div className="kv">
            <span>מחיר ב-eBay</span>
            <span className="mono">{money(p.price, p.currency)}</span>
          </div>
          <div className="kv">
            <span>מצב</span>
            <span>{p.condition ?? '—'}</span>
          </div>
          <div className="kv">
            <span>מותג · MPN</span>
            <span>
              {p.brand ?? '—'} · <span className="mono ltr">{p.mpn ?? '—'}</span>
            </span>
          </div>
          <div className="kv" style={{ borderBottom: 'none' }}>
            <span>קטגוריה</span>
            <span>{p.ebayCategoryName ?? p.ebayCategoryId ?? '—'}</span>
          </div>
        </div>

        <div className="card pad">
          <h2 className="h2">מלאי</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="inner" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>במערכת</span>
              <span className="mono kpi-value" style={{ fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {num(available)}
              </span>
            </div>
            <div className="inner" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>ב-eBay</span>
              <span className="mono kpi-value" style={{ fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: mismatch ? 'var(--warn)' : undefined }}>
                {m?.lastEbayQty === null || m?.lastEbayQty === undefined ? '—' : num(m.lastEbayQty)}
              </span>
            </div>
            <div className="inner" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>באתר</span>
              <span className="mono kpi-value" style={{ fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {m?.lastWooQty === null || m?.lastWooQty === undefined ? '—' : num(m.lastWooQty)}
              </span>
            </div>
          </div>
          {p.images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              {p.images.slice(0, 12).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`תמונה ${i + 1} של ${p.title}`} width={72} height={72} loading="lazy" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0, boxShadow: 'var(--ring)' }} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="h2">היסטוריית מלאי</h2>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{num(ledger.length)} רשומות</span>
        </div>
        {ledger.length === 0 ? (
          <div className="empty">אין רשומות מלאי למוצר הזה.</div>
        ) : (
          <div className="scroll-x">
          <table className="table" style={{ minWidth: 720 }}>
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
                  <td>{dateTime(e.createdAt)}</td>
                  <td>
                    <span className="mono ltr" style={{ fontWeight: 600, color: e.delta > 0 ? 'var(--ok)' : 'var(--bad)' }}>
                      {e.delta > 0 ? `+${e.delta}` : e.delta}
                    </span>
                  </td>
                  <td>{LEDGER_REASON[e.reason] ?? e.reason}</td>
                  <td>{LEDGER_SOURCE[e.source] ?? e.source}</td>
                  <td>
                    <span className="mono ltr">{e.externalOrderId ?? '—'}</span>
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{e.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-head">
          <h2 className="h2">לוג המוצר</h2>
        </div>
        <div className="rows">
          {log.length === 0 ? (
            <div className="empty">אין פעולות סנכרון רשומות למוצר הזה.</div>
          ) : (
            log.map((l) => (
              <div key={l.id} className="row-btn" style={{ cursor: 'default' }}>
                <span className="tile" style={tone(l.success ? 'ok' : l.action === 'qty_mismatch' ? 'warn' : 'bad')} aria-hidden="true">
                  <i className={l.success ? 'ph ph-check' : l.action === 'qty_mismatch' ? 'ph ph-scales' : 'ph ph-warning-circle'} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>
                    {JOB_LABEL[l.job] ?? l.job} · {ACTION_LABEL[l.action] ?? l.action}
                    <span className="sr-only">{l.success ? ' — הצליח' : l.action === 'qty_mismatch' ? ' — פער' : ' — נכשל'}</span>
                  </span>
                  {l.error && l.action !== 'qty_mismatch' && <span style={{ fontSize: 12.5, color: 'var(--bad)' }}>{l.error}</span>}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{dateTime(l.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
