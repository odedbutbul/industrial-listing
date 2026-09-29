'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Palette, Plug, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '@/components/sync/api'
import { dateTime } from '@/components/sync/format'
import type { Overview } from '@/components/sync/types'
import { ThemePicker } from '@/components/sync/ThemePicker'
import { CardHead } from '@/components/sync/CardHead'
import { GoogleCard } from '@/components/sync/GoogleCard'
import { WooCard } from '@/components/sync/WooCard'
import { LoadError, Pill, Spin, useLoad, useToast } from '@/components/sync/ui'

export default function SettingsPage() {
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.get<Overview>('/api/sync/overview'))
  const [busy, setBusy] = useState<'' | 'refresh' | 'test'>('')

  // חזרה מ-eBay אחרי התחברות: ?ebay_oauth=success|error&reason=…
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const r = sp.get('ebay_oauth')
    if (!r) return
    if (r === 'success') toast('החיבור ל-eBay הצליח')
    else toast(`ההתחברות ל-eBay נכשלה: ${sp.get('reason') ?? 'שגיאה לא ידועה'}`, 'bad')
    window.history.replaceState({}, '', '/sync/settings')
  }, [toast])

  if (error) return <LoadError error={error} retry={reload} />

  const ebay = data?.ebay
  const sub = !ebay ? ' ' : !ebay.configured ? 'חסרים משתני סביבה של eBay בשרת' : ebay.connected ? `מחובר ל-eBay (${ebay.environment === 'sandbox' ? 'Sandbox' : 'Production'})` : 'eBay לא מחובר'

  const refresh = async () => {
    setBusy('refresh')
    try {
      await api.post('/api/ebay/oauth/refresh')
      toast('ה-Token חודש')
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'חידוש ה-Token נכשל', 'bad')
    } finally {
      setBusy('')
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const r = await api.post<{ success: boolean; error?: string }>('/api/settings/ebay-test')
      if (r.success) toast('פרטי האפליקציה ב-eBay תקינים')
      else toast(`eBay: ${r.error ?? 'הבדיקה נכשלה'}`, 'bad')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
    } finally {
      setBusy('')
    }
  }

  const ebayPill = !ebay ? null : !ebay.configured ? (
    <Pill t="gray">לא הוגדר</Pill>
  ) : ebay.connected ? (
    <Pill t="ok" dot>
      מחובר
    </Pill>
  ) : (
    <Pill t="bad" dot>
      לא מחובר
    </Pill>
  )

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">הגדרות</h1>
          <p className="ax-sub">{sub}</p>
        </div>
      </div>

      {!data ? (
        <div className="ax-skel" style={{ height: 260 }} />
      ) : (
        <div className="ax-grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          <section className="ax-card" aria-labelledby="ebay-h">
            <CardHead id="ebay-h" icon={Plug} title="eBay" text="חשבון המוכר שממנו נקראות המודעות" pill={ebayPill} />
            {!ebay!.configured ? (
              <div className="ax-card-pad">
                <div className="ax-alert is-warn">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <span>
                    חסרים בשרת: <span className="ax-num ax-ltr">{ebay!.missingEnv.join(', ')}</span>
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="ax-kv">
                  <span>סביבה</span>
                  <span>{ebay!.environment === 'sandbox' ? 'Sandbox — לבדיקות' : 'Production — החשבון האמיתי'}</span>
                </div>
                <div className="ax-kv">
                  <span>Token תקף עד</span>
                  <span className="ax-num">{dateTime(ebay!.accessExpiresAt)}</span>
                </div>
                <div className="ax-kv">
                  <span>החיבור תקף עד</span>
                  <span className="ax-num">{dateTime(ebay!.refreshExpiresAt)}</span>
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <a href="/api/ebay/oauth/authorize?return=/sync/settings" className={'ax-btn' + (ebay!.connected ? '' : ' is-primary')}>
                    <Plug size={18} aria-hidden="true" />
                    {ebay!.connected ? 'התחברות מחדש' : 'התחברות ל-eBay'}
                  </a>
                  {ebay!.connected && (
                    <button type="button" className="ax-btn" onClick={refresh} disabled={!!busy}>
                      {busy === 'refresh' ? <Spin /> : <RefreshCw size={16} aria-hidden="true" />}
                      חידוש Token
                    </button>
                  )}
                  <button type="button" className="ax-btn is-ghost" onClick={test} disabled={!!busy}>
                    {busy === 'test' && <Spin />}
                    בדיקת פרטי האפליקציה
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="ax-card" aria-labelledby="safety-h">
            <CardHead
              id="safety-h"
              icon={ShieldCheck}
              title="בטיחות"
              text="מה המערכת רשאית לשנות"
              pill={data.safety.ebayWritesEnabled ? <Pill t="warn" dot>כתיבה פעילה</Pill> : <Pill t="ok" dot>קריאה בלבד</Pill>}
            />
            <div className="ax-kv">
              <span>כתיבה ל-eBay</span>
              {data.safety.ebayWritesEnabled ? <Pill t="warn" dot>מופעלת</Pill> : <Pill t="ok" dot>חסומה — קריאה בלבד</Pill>}
            </div>
            <div className="ax-kv">
              <span>עדכון כמויות בין הערוצים</span>
              {data.safety.pushEnabled ? <Pill t="warn" dot>מופעל</Pill> : <Pill t="gray" dot>כבוי</Pill>}
            </div>
            <p className="ax-hint" style={{ margin: 0, padding: '14px 20px' }}>
              שני המתגים מוגדרים בשרת (<span className="ax-num ax-ltr">EBAY_WRITES_ENABLED</span>, <span className="ax-num ax-ltr">SYNC_PUSH_ENABLED</span>). הפעלה — רק בהחלטה מפורשת.
            </p>
          </section>

          <WooCard />

          <GoogleCard />

          <section className="ax-card" aria-labelledby="theme-h">
            <CardHead id="theme-h" icon={Palette} title="צבעי הממשק" text="נשמר בדפדפן הזה בלבד" />
            <div className="ax-card-pad">
              <ThemePicker />
            </div>
          </section>
        </div>
      )}
    </>
  )
}
