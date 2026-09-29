'use client'

import { useState } from 'react'
import { AlertTriangle, BarChart3, Copy, PlugZap } from 'lucide-react'
import type { GoogleEnvStatus } from '@/lib/google/config'
import type { GoogleTestResult } from '@/lib/analytics/connection'
import { api } from './api'
import { CardHead } from './CardHead'
import { ACTION_LABEL, dateTime } from './format'
import { Pill, Spin, useLoad, useToast } from './ui'

type Status = GoogleEnvStatus & { lastTest: GoogleTestResult | null; lastFetch: { action: string; at: string; success: boolean; error: string | null }[] }

/** כרטיס החיבור ל-Search Console ול-Google Analytics במסך ההגדרות. הבדיקה קוראת בלבד. */
export function GoogleCard() {
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.get<Status>('/api/sync/analytics/status'))
  const [busy, setBusy] = useState(false)

  const test = async () => {
    setBusy(true)
    try {
      const r = await api.post<GoogleTestResult>('/api/sync/analytics/test')
      toast(r.ok ? 'החיבור לגוגל תקין' : `גוגל: ${[r.token.error, r.gsc.error, r.ga4.error].filter(Boolean).join(' · ') || 'לא הוגדר אף נכס'}`, r.ok ? 'ok' : 'bad')
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הבדיקה נכשלה', 'bad')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v)
      toast('הועתק')
    } catch {
      toast('ההעתקה נכשלה — סמן והעתק ידנית', 'bad')
    }
  }

  const last = data?.lastTest ?? null
  const configured = !!data && (data.gsc || data.ga4)
  const pill = !data ? null : !configured ? <Pill t="gray">לא הוגדר</Pill> : !last ? <Pill t="warn" dot>לא נבדק</Pill> : last.ok ? <Pill t="ok" dot>מחובר</Pill> : <Pill t="bad" dot>שגיאה</Pill>
  const part = (p: GoogleTestResult['gsc'] | undefined, ok: boolean) =>
    !ok ? <Pill t="gray">לא הוגדר</Pill> : !p ? <Pill t="warn" dot>לא נבדק</Pill> : p.ok ? <Pill t="ok" dot>תקין</Pill> : <Pill t="bad" dot>שגיאה</Pill>

  return (
    <section id="google" className="ax-card" aria-labelledby="google-h" style={{ scrollMarginTop: 88 }}>
      <CardHead id="google-h" icon={BarChart3} title="Search Console ו-Google Analytics" text="מקור הנתונים למסך התובנות. קריאה בלבד." pill={pill} />
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
      ) : (
        <>
          {data.serviceAccountError && (
            <div className="ax-card-pad" style={{ paddingBottom: 0 }}>
              <div className="ax-alert is-bad" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{data.serviceAccountError}</span>
              </div>
            </div>
          )}
          <div className="ax-kv">
            <span>Service account</span>
            {data.serviceAccountEmail ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span className="ax-num ax-ltr" dir="ltr" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>
                  {data.serviceAccountEmail}
                </span>
                <button type="button" className="ax-btn is-icon is-sm is-ghost" onClick={() => copy(data.serviceAccountEmail!)} aria-label="העתקת המייל של ה-service account">
                  <Copy size={16} />
                </button>
              </span>
            ) : (
              <Pill t="gray">חסר</Pill>
            )}
          </div>
          <div className="ax-kv">
            <span>
              Search Console{' '}
              {data.siteUrl && (
                <span className="ax-num ax-ltr" dir="ltr" style={{ fontSize: 12 }}>
                  ({data.siteUrl})
                </span>
              )}
            </span>
            {part(last?.gsc?.skipped ? undefined : last?.gsc, data.gsc)}
          </div>
          <div className="ax-kv">
            <span>
              Google Analytics 4{' '}
              {data.propertyId && (
                <span className="ax-num ax-ltr" dir="ltr" style={{ fontSize: 12 }}>
                  ({data.propertyId})
                </span>
              )}
            </span>
            {part(last?.ga4?.skipped ? undefined : last?.ga4, data.ga4)}
          </div>
          {data.lastFetch.map((f) => (
            <div key={f.action} className="ax-kv">
              <span>{ACTION_LABEL[f.action] ?? f.action}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ax-num" style={{ fontSize: 12.5 }}>
                  {dateTime(f.at)}
                </span>
                {f.success ? <Pill t="ok" dot>הצליח</Pill> : <Pill t="bad" dot>נכשל</Pill>}
              </span>
            </div>
          ))}
          {last && !last.ok && (last.token.error || last.gsc.error || last.ga4.error) && (
            <div className="ax-card-pad" style={{ paddingBottom: 0 }}>
              <div className="ax-alert is-bad" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{[last.token.error, last.gsc.error, last.ga4.error].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
          )}
          {data.missingEnv.length > 0 && (
            <div className="ax-card-pad" style={{ paddingBottom: 0 }}>
              <div className="ax-alert is-warn">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  חסרים בשרת: <span className="ax-num ax-ltr">{data.missingEnv.join(', ')}</span>
                </span>
              </div>
              <ol className="ax-hint" style={{ margin: '12px 0 0', paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>ב-Google Cloud: יוצרים פרויקט, מפעילים את Search Console API ואת Google Analytics Data API.</li>
                <li>IAM ← Service Accounts: יוצרים service account ומורידים מפתח JSON.</li>
                <li>Search Console ← הגדרות ← משתמשים: מוסיפים את מייל ה-service account בהרשאה מוגבלת.</li>
                <li>GA4 ← Admin ← Property access management: מוסיפים אותו כ-Viewer.</li>
                <li>
                  בסביבת השרת ב-xCloud: <span className="ax-num ax-ltr">GOOGLE_SERVICE_ACCOUNT_JSON</span> (תוכן הקובץ בשורה אחת), <span className="ax-num ax-ltr">GSC_SITE_URL</span>, <span className="ax-num ax-ltr">GA4_PROPERTY_ID</span> (מספר הנכס).
                </li>
              </ol>
            </div>
          )}
          <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <button type="button" className={'ax-btn' + (last?.ok ? '' : ' is-primary')} onClick={test} disabled={busy || !data.serviceAccount}>
              {busy ? <Spin /> : <PlugZap size={18} aria-hidden="true" />}
              בדיקת חיבור
            </button>
            <span className="ax-hint" role="status">
              {last ? (
                <>
                  נבדק לאחרונה <span className="ax-num">{dateTime(last.checkedAt)}</span>
                </>
              ) : (
                'קריאה בלבד — לא משנה כלום בגוגל'
              )}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
