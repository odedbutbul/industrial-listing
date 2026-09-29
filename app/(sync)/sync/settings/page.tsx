'use client'

import { useEffect, useState } from 'react'
import { api } from '@/components/sync/api'
import { dateTime } from '@/components/sync/format'
import type { Overview } from '@/components/sync/types'
import { Badge, LoadError, tone, useLoad, useToast } from '@/components/sync/ui'

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

  return (
    <section className="section" style={{ gap: 24 }}>
      <div>
        <h1 className="h1">הגדרות</h1>
        <p className="sub">{sub}</p>
      </div>

      {!data ? (
        <div className="skeleton" style={{ height: 260 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head">
              <h2 className="h2">eBay</h2>
              {!ebay!.configured ? <Badge t="gray">לא הוגדר</Badge> : ebay!.connected ? <Badge t="ok" dot>מחובר</Badge> : <Badge t="bad" dot>לא מחובר</Badge>}
            </div>
            {!ebay!.configured ? (
              <div style={{ padding: 20 }}>
                <div className="alert-box" style={tone('warn')}>
                  <i className="ph-fill ph-warning" />
                  <span>
                    חסרים בשרת: <span className="mono ltr">{ebay!.missingEnv.join(', ')}</span>
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="kv">
                  <span>סביבה</span>
                  <span>{ebay!.environment === 'sandbox' ? 'Sandbox — לבדיקות' : 'Production — החשבון האמיתי'}</span>
                </div>
                <div className="kv">
                  <span>Token תקף עד</span>
                  <span className="mono">{dateTime(ebay!.accessExpiresAt)}</span>
                </div>
                <div className="kv">
                  <span>החיבור תקף עד</span>
                  <span className="mono">{dateTime(ebay!.refreshExpiresAt)}</span>
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <a href="/api/ebay/oauth/authorize?return=/sync/settings" className={'btn' + (ebay!.connected ? '' : ' primary')} style={{ textDecoration: 'none' }}>
                    <i className="ph ph-plug" />
                    {ebay!.connected ? 'התחברות מחדש' : 'התחברות ל-eBay'}
                  </a>
                  {ebay!.connected && (
                    <button type="button" className="btn" onClick={refresh} disabled={!!busy}>
                      {busy === 'refresh' ? <i className="ph ph-circle-notch spin" /> : <i className="ph ph-arrows-clockwise" />}
                      חידוש Token
                    </button>
                  )}
                  <button type="button" className="btn ghost" onClick={test} disabled={!!busy}>
                    {busy === 'test' && <i className="ph ph-circle-notch spin" />}
                    בדיקת פרטי האפליקציה
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head">
              <h2 className="h2">בטיחות</h2>
            </div>
            <div className="kv">
              <span>כתיבה ל-eBay</span>
              {data.safety.ebayWritesEnabled ? <Badge t="warn" dot>מופעלת</Badge> : <Badge t="ok" dot>חסומה — קריאה בלבד</Badge>}
            </div>
            <div className="kv">
              <span>עדכון כמויות בין הערוצים</span>
              {data.safety.pushEnabled ? <Badge t="warn" dot>מופעל</Badge> : <Badge t="gray" dot>כבוי</Badge>}
            </div>
            <p className="hint" style={{ margin: 0, padding: '14px 20px' }}>
              שני המתגים מוגדרים בשרת (<span className="mono ltr">EBAY_WRITES_ENABLED</span>, <span className="mono ltr">SYNC_PUSH_ENABLED</span>). הפעלה — רק בהחלטה מפורשת.
            </p>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-head">
              <h2 className="h2">WooCommerce</h2>
              <Badge t="gray">לא הוגדר</Badge>
            </div>
            <p style={{ margin: 0, padding: 20, color: 'var(--text2)' }}>החיבור לחנות ייבנה בשלב הבא, אחרי שנחליט אם זו החנות הקיימת או חנות חדשה.</p>
          </div>
        </div>
      )}
    </section>
  )
}
