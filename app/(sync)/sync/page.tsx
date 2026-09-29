'use client'

import Link from 'next/link'
import { api, openImport } from '@/components/sync/api'
import { ACTION_LABEL, ago, dateTime, JOB_LABEL, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { Overview } from '@/components/sync/types'
import { Badge, EmptyState, Kpi, LoadError, tone, useLoad } from '@/components/sync/ui'

export default function OverviewPage() {
  const { data, error, reload } = useLoad(() => api.get<Overview>('/api/sync/overview'))
  useDataChanged(reload)

  if (error) return <LoadError error={error} retry={reload} />

  const c = data?.counts
  const ebayConnected = !!data && data.ebay.configured && data.ebay.connected
  const sub = !data
    ? ' '
    : !ebayConnected
      ? 'eBay לא מחובר — ייבוא לא יעבוד עד שמתחברים בהגדרות'
      : c!.mismatches || c!.errors24h
        ? [c!.mismatches && `${num(c!.mismatches)} פערי כמות מול eBay`, c!.errors24h && `${num(c!.errors24h)} תקלות ב-24 השעות האחרונות`].filter(Boolean).join(' · ')
        : c!.products
          ? 'הכל תואם. אין פערים ואין תקלות'
          : 'מחובר ל-eBay. עוד לא יובאו מוצרים'

  return (
    <section className="section" style={{ gap: 24 }}>
      <div>
        <h1 className="h1">מצב המלאי</h1>
        <p className="sub">{sub}</p>
      </div>

      {data && (
        <div className="alert-box" style={tone(data.safety.ebayWritesEnabled ? 'warn' : 'gray')}>
          <i className={data.safety.ebayWritesEnabled ? 'ph-fill ph-warning' : 'ph-fill ph-shield-check'} />
          <span>
            {data.safety.ebayWritesEnabled
              ? 'כתיבה ל-eBay מופעלת בשרת — המערכת יכולה לשנות מודעות בחשבון.'
              : 'eBay במצב קריאה בלבד: המערכת קוראת מודעות ולא משנה שום דבר בחשבון.'}
          </span>
        </div>
      )}

      {!data ? (
        <>
          <div className="skeleton" style={{ height: 132 }} />
          <div className="skeleton" style={{ height: 220 }} />
        </>
      ) : c!.products === 0 ? (
        ebayConnected ? (
          <EmptyState
            icon="ph ph-download-simple"
            title="עדיין אין מוצרים"
            text="הייבוא קורא את המודעות הפעילות ב-eBay ומכניס אותן למערכת עם ה-SKU והמלאי. קודם מוצגת תצוגה מקדימה, ושום דבר לא משתנה ב-eBay."
            action={
              <button type="button" className="btn primary lg" onClick={openImport}>
                <i className="ph-bold ph-download-simple" />
                ייבוא מ-eBay
              </button>
            }
          />
        ) : (
          <EmptyState
            icon="ph ph-plugs"
            title="צריך להתחבר ל-eBay"
            text="המערכת עוד לא מחוברת לחשבון eBay. אחרי ההתחברות אפשר לייבא את המודעות הפעילות — קריאה בלבד."
            action={
              <Link href="/sync/settings" className="btn primary lg" style={{ textDecoration: 'none' }}>
                <i className="ph-bold ph-plug" />
                להגדרות החיבור
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="kpis">
            <Kpi icon="ph ph-package" label="מוצרים" value={num(c!.products)} sub={`${num(c!.units)} יחידות במלאי`} />
            <Kpi icon="ph ph-check-circle" label="במלאי" value={num(c!.inStock)} sub={c!.soldOut ? `${num(c!.soldOut)} אזלו` : 'אין מוצרים שאזלו'} />
            {c!.mismatches ? (
              <Kpi icon="ph ph-warning" label="פערים מול eBay" value={num(c!.mismatches)} sub="הכמות ב-eBay שונה מהמלאי. לבדיקה" critical />
            ) : (
              <Kpi icon="ph ph-scales" label="פערים מול eBay" value="0" sub="המלאי תואם ל-eBay" />
            )}
            <Kpi icon="ph ph-storefront" label="מקושרים לאתר" value={num(c!.wooLinked)} sub="WooCommerce עוד לא מחובר" />
            {c!.errors24h ? (
              <Kpi icon="ph ph-warning-octagon" label="תקלות ב-24 שעות" value={num(c!.errors24h)} sub="פרטים בלוג" critical />
            ) : (
              <Kpi icon="ph ph-heartbeat" label="תקלות ב-24 שעות" value="0" sub="הכל רץ תקין" />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-head">
                <h2 className="h2">ייבוא אחרון</h2>
                <Link href="/sync/log?job=import-ebay" className="link-btn" style={{ fontSize: 13.5 }}>
                  כל הריצות
                  <i className="ph ph-arrow-left" />
                </Link>
              </div>
              {data.lastImport ? (
                <div>
                  <div className="kv">
                    <span>מתי</span>
                    <span>{dateTime(data.lastImport.at)}</span>
                  </div>
                  <div className="kv">
                    <span>תוצאה</span>
                    <Badge t={data.lastImport.success ? 'ok' : 'bad'} dot>
                      {data.lastImport.success ? 'הצליח' : 'עם שגיאות'}
                    </Badge>
                  </div>
                  <div className="kv">
                    <span>מוצרים חדשים</span>
                    <span className="mono">{num(data.lastImport.details?.created ?? 0)}</span>
                  </div>
                  <div className="kv">
                    <span>דולגו</span>
                    <span className="mono">{num(data.lastImport.details?.skipped ?? 0)}</span>
                  </div>
                  <div className="kv" style={{ borderBottom: 'none' }}>
                    <span>שגיאות</span>
                    <span className="mono" style={{ color: data.lastImport.details?.errors ? 'var(--bad)' : undefined }}>
                      {num(data.lastImport.details?.errors ?? 0)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="empty">עוד לא רץ ייבוא.</div>
              )}
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-head">
                <h2 className="h2">תקלות אחרונות</h2>
                <Link href="/sync/log?status=fail" className="link-btn" style={{ fontSize: 13.5 }}>
                  כל התקלות
                  <i className="ph ph-arrow-left" />
                </Link>
              </div>
              <div className="rows">
                {data.recentFailures.length === 0 ? (
                  <div className="empty">אין תקלות. כל הפעולות הצליחו.</div>
                ) : (
                  data.recentFailures.map((f) => (
                    <Link key={f.id} href={f.productId ? `/sync/products/${f.productId}` : '/sync/log?status=fail'} className="row-btn" style={{ textDecoration: 'none' }}>
                      <span className="tile" style={tone('bad')}>
                        <i className="ph ph-warning-circle" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>
                          {JOB_LABEL[f.job] ?? f.job} · {ACTION_LABEL[f.action] ?? f.action}
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.error ?? '—'}</span>
                      </span>
                      <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ago(f.createdAt)}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
