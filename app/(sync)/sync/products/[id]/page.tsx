'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/components/sync/api'
import { ago, dateTime, money, num, shipPrice, shipIsMoney, stockStatus, WOO_NOT_LINKED } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { ProductDetail } from '@/components/sync/types'
import { WooLink } from '@/components/sync/WooLink'
import { ProductHistory } from '@/components/sync/ProductHistory'
import { QualityAlert } from '@/components/sync/QualityAlert'
import { ZoomThumb } from '@/components/sync/Lightbox'
import dynamic from 'next/dynamic'

// הטופס (עורך הטקסט) נטען רק למוצר ידני — דף מוצר eBay לא צריך אותו
const ManualProductScreen = dynamic(() => import('@/components/sync/ManualProductScreen').then((m) => m.ManualProductScreen), {
  loading: () => <div className="ax-skel" style={{ height: 420 }} />,
})
import { LoadError, Pill, useLoad } from '@/components/sync/ui'
import { AlertTriangle, ArrowRight, ExternalLink, Info } from 'lucide-react'

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
  // מוצר ידני (לא קשור ל-eBay): הדף שלו הוא טופס העריכה + היסטוריית המלאי והלוג
  if (p.source === 'manual') return <ManualProductScreen id={id} detail={data} onSaved={reload} />
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

      <QualityAlert productId={p.id} />

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
            {m?.wooProductId ? <WooLink id={m.wooProductId} /> : <Pill t={WOO_NOT_LINKED[1]}>{WOO_NOT_LINKED[0]}</Pill>}
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
                <ZoomThumb key={src} images={p.images} index={i} title={p.title} size={72} alt={`תמונה ${i + 1} של ${p.title}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ShippingCard p={p} />

      <FullDetails p={p} />

      <ProductHistory ledger={ledger} log={log} />
    </>
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

const SHIPPING_TYPE: Record<string, string> = {
  Flat: 'מחיר קבוע',
  Calculated: 'מחושב לפי הקונה',
  FlatDomesticCalculatedInternational: 'קבוע בארה״ב · מחושב לחו״ל',
  CalculatedDomesticFlatInternational: 'מחושב בארה״ב · קבוע לחו״ל',
  Free: 'חינם',
  Freight: 'הובלה (Freight)',
  NotSpecified: 'לא הוגדר',
}

/** מחירי המשלוח מ-eBay: ארה״ב ושאר העולם, ומתחת כל השירותים שהוגדרו במודעה */
function ShippingCard({ p }: { p: ProductDetail['product'] }) {
  const c = p.shippingCosts
  if (!c)
    return (
      <div className="ax-alert tone-gray">
        <Info size={18} aria-hidden="true" />
        <span>מחירי המשלוח של המודעה עוד לא נקראו מ-eBay. הם ייקראו בריצת מחירי המשלוח הבאה.</span>
      </div>
    )
  const services = [
    ...c.domestic.map((o) => ({ o, region: 'ארה״ב' })),
    ...c.international.map((o) => ({ o, region: o.shipTo.length ? o.shipTo.join(', ') : 'בינלאומי' })),
  ]
  return (
    <div className="ax-card">
      <div className="ax-card-head">
        <h2 className="ax-h2">מחירי משלוח</h2>
        <span className="ax-muted" style={{ fontSize: 12.5 }}>
          מ-eBay · <span className="ax-num">{dateTime(p.shippingCostsFetchedAt)}</span>
        </span>
      </div>
      <div className="ax-card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 8 }}>
        <div className="ax-inner" style={{ flex: '1 1 200px', minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="ax-kpi-label">לארה״ב</span>
          <span className={shipIsMoney(c.us) ? 'ax-kpi-value' : 'ax-h2'}>{shipPrice(c.us, c.currency)}</span>
          <span className="ax-hint ax-ltr" style={{ textAlign: 'start' }}>{c.us?.service ?? '—'}</span>
        </div>
        <div className="ax-inner" style={{ flex: '1 1 200px', minWidth: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="ax-kpi-label">לשאר העולם</span>
          <span className={shipIsMoney(c.intl) ? 'ax-kpi-value' : 'ax-h2'}>{shipPrice(c.intl, c.currency, c.globalShipping)}</span>
          <span className="ax-hint ax-ltr" style={{ textAlign: 'start' }}>{c.intl?.service ?? (c.globalShipping ? 'eBay מחשב את המחיר לחו״ל' : 'אין משלוח לחו״ל')}</span>
        </div>
      </div>
      <div className="ax-kv">
        <span>סוג המשלוח</span>
        <span>{c.type ? SHIPPING_TYPE[c.type] ?? c.type : '—'}</span>
      </div>
      {c.policyName && (
        <div className="ax-kv">
          <span>מדיניות משלוח</span>
          <span className="ax-ltr">{c.policyName}</span>
        </div>
      )}
      {services.map(({ o, region }, i) => (
        <div key={i} className="ax-kv">
          <span>
            <span className="ax-ltr">{o.service ?? '—'}</span>
            <span className="ax-muted" style={{ fontSize: 12.5 }}> · {region}</span>
          </span>
          <span className={shipIsMoney(o) ? 'ax-num' : undefined}>
            {shipPrice(o, c.currency)}
            {o.additionalCost !== null && !o.free && <span className="ax-muted"> · נוסף {money(o.additionalCost, c.currency ?? 'USD')}</span>}
          </span>
        </div>
      ))}
      {c.excludeLocations.length > 0 && (
        <div className="ax-kv">
          <span>לא נשלח אל</span>
          <span className="ax-ltr" style={{ textAlign: 'end' }}>{c.excludeLocations.join(', ')}</span>
        </div>
      )}
    </div>
  )
}
