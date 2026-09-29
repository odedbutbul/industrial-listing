'use client'

import Link from 'next/link'
import { AlertCircle, AlertTriangle, ArrowLeft, Download, Plug, ShieldCheck } from 'lucide-react'
import { api, openImport } from '@/components/sync/api'
import { ACTION_LABEL, ago, dateTime, JOB_LABEL, num } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { Overview } from '@/components/sync/types'
import { EmptyState, Kpi, LoadError, Pill, useLoad } from '@/components/sync/ui'

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
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">מצב המלאי</h1>
          <p className="ax-sub">{sub}</p>
        </div>
      </div>

      {data && (
        <div className={'ax-alert ' + (data.safety.ebayWritesEnabled ? 'is-warn' : 'is-ok')} role="status">
          {data.safety.ebayWritesEnabled ? <AlertTriangle size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
          <span>
            {data.safety.ebayWritesEnabled
              ? 'כתיבה ל-eBay מופעלת בשרת — המערכת יכולה לשנות מודעות בחשבון.'
              : 'eBay במצב קריאה בלבד: המערכת קוראת מודעות ולא משנה שום דבר בחשבון.'}
          </span>
        </div>
      )}

      {!data ? (
        <>
          <div className="ax-skel" style={{ height: 132 }} />
          <div className="ax-skel" style={{ height: 220 }} />
        </>
      ) : c!.products === 0 ? (
        ebayConnected ? (
          <EmptyState
            icon={Download}
            title="עדיין אין מוצרים"
            text="הייבוא קורא את המודעות הפעילות ב-eBay ומכניס אותן למערכת עם ה-SKU והמלאי. קודם מוצגת תצוגה מקדימה, ושום דבר לא משתנה ב-eBay."
            action={
              <button type="button" className="ax-btn is-primary" onClick={openImport}>
                <Download size={18} aria-hidden="true" />
                ייבוא מ-eBay
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={Plug}
            title="צריך להתחבר ל-eBay"
            text="המערכת עוד לא מחוברת לחשבון eBay. אחרי ההתחברות אפשר לייבא את המודעות הפעילות — קריאה בלבד."
            action={
              <Link href="/sync/settings" className="ax-btn is-primary">
                <Plug size={18} aria-hidden="true" />
                להגדרות החיבור
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="ax-kpis">
            <Kpi label="מוצרים" value={num(c!.products)} sub={`${num(c!.units)} יחידות במלאי`} />
            <Kpi
              label="במלאי"
              value={num(c!.inStock)}
              sub={c!.soldOut ? `${num(c!.soldOut)} אזלו` : 'אין מוצרים שאזלו'}
              bar={c!.products ? (c!.inStock / c!.products) * 100 : 0}
            />
            {c!.mismatches ? (
              <Kpi label="פערים מול eBay" value={num(c!.mismatches)} sub="הכמות ב-eBay שונה מהמלאי. לבדיקה" critical />
            ) : (
              <Kpi label="פערים מול eBay" value="0" sub="המלאי תואם ל-eBay" />
            )}
            <Kpi
              label="בחנות"
              value={num(c!.wooLinked)}
              sub={
                c!.wooLinked ? (
                  <Link href="/sync/products?filter=in_woo">לרשימת המוצרים שבחנות</Link>
                ) : (
                  <Link href="/sync/products?filter=ready">בחירת מוצרים לשליחה</Link>
                )
              }
            />
            {c!.errors24h ? (
              <Kpi label="תקלות ב-24 שעות" value={num(c!.errors24h)} sub="פרטים בלוג" critical />
            ) : (
              <Kpi label="תקלות ב-24 שעות" value="0" sub="הכל רץ תקין" />
            )}
          </div>

          <div className="ax-grid-auto">
            <section className="ax-card" aria-labelledby="last-import-h">
              <div className="ax-card-head">
                <h2 id="last-import-h" className="ax-h2">
                  ייבוא אחרון
                </h2>
                <Link href="/sync/log?job=import-ebay" className="ax-btn is-link">
                  כל הריצות
                  <ArrowLeft size={16} aria-hidden="true" />
                </Link>
              </div>
              {data.lastImport ? (
                <div>
                  <div className="ax-kv">
                    <span>מתי</span>
                    <span className="ax-num">{dateTime(data.lastImport.at)}</span>
                  </div>
                  <div className="ax-kv">
                    <span>תוצאה</span>
                    <Pill t={data.lastImport.success ? 'ok' : 'bad'} dot>
                      {data.lastImport.success ? 'הצליח' : 'עם שגיאות'}
                    </Pill>
                  </div>
                  <div className="ax-kv">
                    <span>מוצרים חדשים</span>
                    <span className="ax-num">{num(data.lastImport.details?.created ?? 0)}</span>
                  </div>
                  <div className="ax-kv">
                    <span>דולגו</span>
                    <span className="ax-num">{num(data.lastImport.details?.skipped ?? 0)}</span>
                  </div>
                  <div className="ax-kv">
                    <span>שגיאות</span>
                    <span className="ax-num" style={{ color: data.lastImport.details?.errors ? 'var(--ax-bad)' : undefined }}>
                      {num(data.lastImport.details?.errors ?? 0)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="ax-note">עוד לא רץ ייבוא.</p>
              )}
            </section>

            <section className="ax-card" aria-labelledby="failures-h">
              <div className="ax-card-head">
                <h2 id="failures-h" className="ax-h2">
                  תקלות אחרונות
                </h2>
                <Link href="/sync/log?status=fail" className="ax-btn is-link">
                  כל התקלות
                  <ArrowLeft size={16} aria-hidden="true" />
                </Link>
              </div>
              {data.recentFailures.length === 0 ? (
                <p className="ax-note">אין תקלות. כל הפעולות הצליחו.</p>
              ) : (
                <div className="ax-rows">
                  {data.recentFailures.map((f) => (
                    <Link key={f.id} href={f.productId ? `/sync/products/${f.productId}` : '/sync/log?status=fail'} className="ax-row-btn">
                      <span className="ax-tile tone-bad" aria-hidden="true">
                        <AlertCircle size={18} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>
                          {JOB_LABEL[f.job] ?? f.job} · {ACTION_LABEL[f.action] ?? f.action}
                        </span>
                        <span className="ax-muted" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.error ?? '—'}
                        </span>
                      </span>
                      <span className="ax-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {ago(f.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </>
  )
}
