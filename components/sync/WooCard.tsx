'use client'

import { useState } from 'react'
import { AlertTriangle, PlugZap, Store } from 'lucide-react'
import { announceDataChanged, api } from './api'
import { dateTime } from './format'
import type { WooStatus, WooTestResult } from './types'
import { Pill, Spin, useLoad, useToast } from './ui'
import { CardHead } from './CardHead'

/** כרטיס החיבור ל-WooCommerce במסך ההגדרות. הבדיקה קוראת בלבד מהחנות. */
export function WooCard() {
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.get<WooStatus>('/api/sync/woo/status'))
  const [busy, setBusy] = useState(false)

  const test = async () => {
    setBusy(true)
    try {
      const r = await api.post<WooTestResult>('/api/sync/woo/test')
      if (r.ok) toast('החיבור לחנות תקין')
      else toast(`WooCommerce: ${r.error}`, 'bad')
      await reload()
      announceDataChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const last = data?.lastTest ?? null
  const pill = !data ? null : !data.configured ? (
    <Pill t="gray">לא הוגדר</Pill>
  ) : !last ? (
    <Pill t="warn" dot>
      לא נבדק
    </Pill>
  ) : last.ok ? (
    <Pill t="ok" dot>
      מחובר
    </Pill>
  ) : (
    <Pill t="bad" dot>
      שגיאה
    </Pill>
  )

  return (
    <section className="ax-card" aria-labelledby="woo-h">
      <CardHead id="woo-h" icon={Store} title="WooCommerce" text="החנות שאליה יסונכרנו המוצרים והמלאי" pill={pill} />
      {error ? (
        <div className="ax-card-pad">
          <div className="ax-alert is-bad" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button type="button" className="ax-btn" style={{ marginTop: 12 }} onClick={() => reload()}>
            נסה שוב
          </button>
        </div>
      ) : !data ? (
        <div className="ax-card-pad">
          <div className="ax-skel" style={{ height: 120 }} />
        </div>
      ) : !data.configured ? (
        <div className="ax-card-pad">
          <div className="ax-alert is-warn">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              חסרים בשרת: <span className="ax-num ax-ltr">{data.missingEnv.join(', ')}</span>
            </span>
          </div>
          <p className="ax-hint" style={{ margin: '12px 0 0' }}>
            יוצרים מפתח בחנות: WooCommerce ← Settings ← Advanced ← REST API, הרשאת Read/Write, ומכניסים אותו לסביבת השרת ב-xCloud.
          </p>
        </div>
      ) : (
        <>
          <div className="ax-kv">
            <span>כתובת החנות</span>
            <span className="ax-num ax-ltr">{data.baseUrl}</span>
          </div>
          {last?.ok && (
            <>
              <div className="ax-kv">
                <span>גרסאות</span>
                <span className="ax-num ax-ltr">
                  WooCommerce {last.info.wcVersion ?? '—'} · WordPress {last.info.wpVersion ?? '—'}
                </span>
              </div>
              <div className="ax-kv">
                <span>מטבע</span>
                {last.info.currency === 'USD' ? <span className="ax-num">USD</span> : <Pill t="warn" dot>{last.info.currency ?? 'לא ידוע'} — צריך USD</Pill>}
              </div>
              <div className="ax-kv">
                <span>ניהול מלאי בחנות</span>
                {last.info.manageStock ? <Pill t="ok" dot>מופעל</Pill> : <Pill t="warn" dot>כבוי — צריך להפעיל</Pill>}
              </div>
              <div className="ax-kv">
                <span>מוצרים בחנות</span>
                <span className="ax-num">{last.info.products ?? '—'}</span>
              </div>
              <div className="ax-kv">
                <span>Webhooks מוגדרים</span>
                <span className="ax-num">{last.info.webhooks ?? '—'}</span>
              </div>
            </>
          )}
          {last && !last.ok && (
            <div className="ax-card-pad" style={{ paddingBottom: 0 }}>
              <div className="ax-alert is-bad" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{last.error}</span>
              </div>
            </div>
          )}
          <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <button type="button" className={'ax-btn' + (last?.ok ? '' : ' is-primary')} onClick={test} disabled={busy}>
              {busy ? <Spin /> : <PlugZap size={18} aria-hidden="true" />}
              בדיקת חיבור
            </button>
            <span className="ax-hint" role="status">
              {last ? (
                <>
                  נבדק לאחרונה <span className="ax-num">{dateTime(last.checkedAt)}</span>
                </>
              ) : (
                'קריאה בלבד — לא משנה כלום בחנות'
              )}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
