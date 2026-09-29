'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import ThemeToggle from '@/components/ThemeToggle'

type Settings = {
  EBAY_APP_ID: string
  EBAY_CERT_ID: string
  EBAY_DEV_ID: string
  EBAY_USER_TOKEN: string
  EBAY_RUNAME: string
  EBAY_OAUTH_ACCESS_TOKEN: string
  EBAY_OAUTH_REFRESH_TOKEN: string
  EBAY_OAUTH_TOKEN_EXPIRES_AT: string
  EBAY_SANDBOX: string
  EBAY_PAYMENT_PROFILE_ID: string
  EBAY_PAYMENT_PROFILE_NAME: string
  EBAY_RETURN_PROFILE_ID: string
  EBAY_RETURN_PROFILE_NAME: string
  EBAY_SHIPPING_PROFILE_ID: string
  EBAY_SHIPPING_PROFILE_NAME: string
  CLOUDINARY_CLOUD_NAME: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
}

const EMPTY: Settings = {
  EBAY_APP_ID: '',
  EBAY_CERT_ID: '',
  EBAY_DEV_ID: '',
  EBAY_USER_TOKEN: '',
  EBAY_RUNAME: '',
  EBAY_OAUTH_ACCESS_TOKEN: '',
  EBAY_OAUTH_REFRESH_TOKEN: '',
  EBAY_OAUTH_TOKEN_EXPIRES_AT: '',
  EBAY_SANDBOX: 'true',
  EBAY_PAYMENT_PROFILE_ID: '',
  EBAY_PAYMENT_PROFILE_NAME: '',
  EBAY_RETURN_PROFILE_ID: '',
  EBAY_RETURN_PROFILE_NAME: '',
  EBAY_SHIPPING_PROFILE_ID: '',
  EBAY_SHIPPING_PROFILE_NAME: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
}

interface SellerProfile { id: string; name: string }

function SectionCard({ icon, title, subtitle, children }: {
  icon: string; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className="card p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-xl shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-white/40">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, mono = true }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; mono?: boolean
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label className="label-base">{label}</label>
      <div className="relative">
        <input
          type={isPassword && !show ? 'password' : 'text'}
          className={`input-base ${mono ? 'font-mono text-xs' : ''} ${isPassword ? 'pl-10' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {isPassword && (
          <button type="button" tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition-colors">
            {show ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function SaveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="btn-primary h-[44px] px-6 text-sm flex items-center gap-2">
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          שומר...
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          שמור
        </>
      )}
    </button>
  )
}

type EbayConnection = {
  configured: boolean
  missingEnv: string[]
  connected: boolean
  environment?: 'sandbox' | 'production'
  accessExpiresAt?: string | null
  refreshExpiresAt?: string | null
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [ebayStatus, setEbayStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [fetchingPolicies, setFetchingPolicies] = useState(false)
  const [policyProfiles, setPolicyProfiles] = useState<{
    shipping: SellerProfile[]; return: SellerProfile[]; payment: SellerProfile[]
  } | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [ebayConn, setEbayConn] = useState<EbayConnection | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function loadEbayConn() {
    try {
      const res = await fetch('/api/ebay/oauth/status')
      setEbayConn(await res.json())
    } catch {
      setEbayConn(null)
    }
  }

  useEffect(() => {
    // Check for OAuth callback result in URL params
    const params = new URLSearchParams(window.location.search)
    const oauthResult = params.get('ebay_oauth')
    if (oauthResult === 'success') {
      setOauthStatus('success')
      toast.success('התחברות ל-eBay הצליחה! ה-Token נשמר.')
      window.history.replaceState({}, '', '/settings')
    } else if (oauthResult === 'error') {
      setOauthStatus('error')
      setOauthError(params.get('reason') || 'שגיאה לא ידועה')
      toast.error('שגיאה בהתחברות ל-eBay')
      window.history.replaceState({}, '', '/settings')
    }

    loadEbayConn()
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function update(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  async function save(keys: (keyof Settings)[], section: string) {
    setSaving(section)
    try {
      const payload = Object.fromEntries(keys.map((k) => [k, settings[k]]))
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success('הגדרות נשמרו בהצלחה')
    } catch {
      toast.error('שגיאה בשמירה')
    } finally {
      setSaving(null)
    }
  }

  async function fetchPolicies() {
    setFetchingPolicies(true)
    setPolicyError(null)
    try {
      const res = await fetch('/api/ebay/policies')
      const data = await res.json()
      if (data.error) { setPolicyError(data.error); return }
      setPolicyProfiles({
        shipping: data.shippingProfiles ?? [],
        return:   data.returnProfiles   ?? [],
        payment:  data.paymentProfiles  ?? [],
      })
      const total = (data.shippingProfiles?.length ?? 0) + (data.returnProfiles?.length ?? 0) + (data.paymentProfiles?.length ?? 0)
      toast.success(`נמצאו ${total} פוליסות — בחר ושמור`)
    } catch {
      setPolicyError('שגיאה בטעינת הפוליסות')
    } finally {
      setFetchingPolicies(false)
    }
  }

  async function testEbay() {
    setTesting('ebay')
    setEbayStatus('idle')
    try {
      const res = await fetch('/api/settings/ebay-test', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setEbayStatus('ok')
        toast.success(`eBay API מחובר בהצלחה (${data.mode === 'sandbox' ? 'Sandbox' : 'Production'}) ✓`)
      } else {
        setEbayStatus('error')
        toast.error(`eBay: ${data.error}`)
      }
    } catch {
      setEbayStatus('error')
      toast.error('שגיאה בבדיקת eBay')
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center">
        <svg className="w-7 h-7 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] transition-colors duration-200">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0f1117]/80 backdrop-blur-md border-b border-gray-100 dark:border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-white/20 transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <h1 className="flex-1 text-base font-bold text-gray-900 dark:text-white">הגדרות מערכת</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4 animate-fade-in">

        {/* eBay API */}
        <SectionCard icon="🛒" title="eBay" subtitle="חיבור לחשבון eBay של החנות">

          {/* מצב חיבור — פרטי האפליקציה מגיעים ממשתני סביבה, הטוקן נשמר מוצפן ב-Postgres */}
          {!ebayConn ? (
            <p className="text-sm text-gray-500 dark:text-white/40">טוען מצב חיבור...</p>
          ) : !ebayConn.configured ? (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-sm text-amber-800 dark:text-amber-300">
              חסרים משתני סביבה בשרת: <span dir="ltr" className="font-mono">{ebayConn.missingEnv.join(', ')}</span>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-white/[0.04]">
              <div className="flex justify-between items-center py-2.5">
                <span className="text-sm text-gray-500 dark:text-white/40">סביבה</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white/70">
                  {ebayConn.environment === 'sandbox' ? 'Sandbox — לבדיקות' : 'Production — חשבון אמיתי'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-sm text-gray-500 dark:text-white/40">חיבור</span>
                <span className={`text-sm font-medium ${ebayConn.connected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {ebayConn.connected ? 'מחובר' : 'לא מחובר'}
                </span>
              </div>
              {ebayConn.accessExpiresAt && (
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-gray-500 dark:text-white/40">Token תקף עד</span>
                  <span className="text-sm font-mono text-gray-800 dark:text-white/70">{new Date(ebayConn.accessExpiresAt).toLocaleString('he-IL')}</span>
                </div>
              )}
              {ebayConn.refreshExpiresAt && (
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-gray-500 dark:text-white/40">חיבור בתוקף עד</span>
                  <span className="text-sm font-mono text-gray-800 dark:text-white/70">{new Date(ebayConn.refreshExpiresAt).toLocaleDateString('he-IL')}</span>
                </div>
              )}
            </div>
          )}

          {oauthStatus === 'error' && oauthError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-3">❌ {oauthError}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => { window.location.href = '/api/ebay/oauth/authorize' }}
              disabled={!ebayConn?.configured}
              className="h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-40">
              {ebayConn?.connected ? 'התחבר מחדש ל-eBay' : 'התחבר ל-eBay (OAuth)'}
            </button>
            {ebayConn?.connected && (
              <button
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true)
                  try {
                    const res = await fetch('/api/ebay/oauth/refresh', { method: 'POST' })
                    const data = await res.json()
                    if (data.success) toast.success('Token חודש בהצלחה')
                    else toast.error(data.error || 'שגיאה בחידוש Token')
                    await loadEbayConn()
                  } catch {
                    toast.error('שגיאה בחידוש Token')
                  } finally {
                    setRefreshing(false)
                  }
                }}
                className="btn-ghost h-[44px] px-4 text-sm disabled:opacity-40">
                {refreshing ? 'מחדש...' : 'חדש Token'}
              </button>
            )}
            <button onClick={testEbay}
              disabled={testing === 'ebay' || !ebayConn?.configured}
              className="btn-ghost h-[44px] px-4 text-sm disabled:opacity-40">
              {testing === 'ebay' ? 'בודק...' : 'בדוק פרטי אפליקציה'}
            </button>
          </div>

          {ebayStatus !== 'idle' && (
            <p className={`mt-3 text-sm ${ebayStatus === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {ebayStatus === 'ok' ? '✅ App ID ו-Cert ID תקינים' : '❌ App ID או Cert ID לא תקינים'}
            </p>
          )}
        </SectionCard>

        {/* eBay Business Policies */}
        <SectionCard icon="📋" title="eBay Business Policies" subtitle="פוליסות משלוח, החזרות ותשלום — נדרשות לפרסום">

          {(settings.EBAY_SHIPPING_PROFILE_ID && settings.EBAY_RETURN_PROFILE_ID) ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 text-xs mb-4">
              <span>✅</span>
              <span>
                משלוח: <strong>{settings.EBAY_SHIPPING_PROFILE_NAME || settings.EBAY_SHIPPING_PROFILE_ID}</strong>
                {' · '}החזרות: <strong>{settings.EBAY_RETURN_PROFILE_NAME || settings.EBAY_RETURN_PROFILE_ID}</strong>
                {settings.EBAY_PAYMENT_PROFILE_ID && <>{' · '}תשלום: <strong>{settings.EBAY_PAYMENT_PROFILE_NAME || settings.EBAY_PAYMENT_PROFILE_ID}</strong></>}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs mb-4">
              <span>⚠️</span>
              <span>פוליסות לא מוגדרות — לחץ &quot;טען מ-eBay&quot; כדי לטעון</span>
            </div>
          )}

          <button onClick={fetchPolicies}
            disabled={fetchingPolicies || !settings.EBAY_APP_ID || !settings.EBAY_CERT_ID}
            className="btn-ghost h-[44px] px-4 text-sm flex items-center gap-2 mb-4 disabled:opacity-40">
            {fetchingPolicies ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                טוען פוליסות...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                טען פוליסות מ-eBay
              </>
            )}
          </button>

          {policyError && <p className="text-xs text-red-500 dark:text-red-400 mb-3">{policyError}</p>}

          <div className="space-y-3">
            {/* Shipping */}
            <div>
              <label className="label-base">Shipping Policy <span className="text-red-400">*</span></label>
              {policyProfiles && policyProfiles.shipping.length > 0 ? (
                <select className="input-base"
                  value={settings.EBAY_SHIPPING_PROFILE_ID}
                  onChange={(e) => {
                    const pol = policyProfiles.shipping.find((p) => p.id === e.target.value)
                    setSettings((prev) => ({ ...prev, EBAY_SHIPPING_PROFILE_ID: e.target.value, EBAY_SHIPPING_PROFILE_NAME: pol?.name ?? '' }))
                  }}>
                  <option value="">— בחר פוליסת משלוח —</option>
                  {policyProfiles.shipping.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              ) : (
                <input className="input-base font-mono text-xs" value={settings.EBAY_SHIPPING_PROFILE_ID}
                  onChange={(e) => update('EBAY_SHIPPING_PROFILE_ID', e.target.value)} placeholder="Shipping Profile ID" />
              )}
            </div>

            {/* Return */}
            <div>
              <label className="label-base">Return Policy <span className="text-red-400">*</span></label>
              {policyProfiles && policyProfiles.return.length > 0 ? (
                <select className="input-base"
                  value={settings.EBAY_RETURN_PROFILE_ID}
                  onChange={(e) => {
                    const pol = policyProfiles.return.find((p) => p.id === e.target.value)
                    setSettings((prev) => ({ ...prev, EBAY_RETURN_PROFILE_ID: e.target.value, EBAY_RETURN_PROFILE_NAME: pol?.name ?? '' }))
                  }}>
                  <option value="">— בחר פוליסת החזרות —</option>
                  {policyProfiles.return.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              ) : (
                <input className="input-base font-mono text-xs" value={settings.EBAY_RETURN_PROFILE_ID}
                  onChange={(e) => update('EBAY_RETURN_PROFILE_ID', e.target.value)} placeholder="Return Profile ID" />
              )}
            </div>

            {/* Payment */}
            <div>
              <label className="label-base">Payment Policy <span className="text-gray-400 dark:text-white/30 font-normal">(אופציונלי)</span></label>
              {policyProfiles && policyProfiles.payment.length > 0 ? (
                <select className="input-base"
                  value={settings.EBAY_PAYMENT_PROFILE_ID}
                  onChange={(e) => {
                    const pol = policyProfiles.payment.find((p) => p.id === e.target.value)
                    setSettings((prev) => ({ ...prev, EBAY_PAYMENT_PROFILE_ID: e.target.value, EBAY_PAYMENT_PROFILE_NAME: pol?.name ?? '' }))
                  }}>
                  <option value="">— בחר פוליסת תשלום —</option>
                  {policyProfiles.payment.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              ) : (
                <input className="input-base font-mono text-xs" value={settings.EBAY_PAYMENT_PROFILE_ID}
                  onChange={(e) => update('EBAY_PAYMENT_PROFILE_ID', e.target.value)} placeholder="Payment Profile ID (אופציונלי)" />
              )}
            </div>
          </div>

          <div className="mt-4">
            <SaveButton loading={saving === 'policies'}
              onClick={() => save([
                'EBAY_SHIPPING_PROFILE_ID', 'EBAY_SHIPPING_PROFILE_NAME',
                'EBAY_RETURN_PROFILE_ID',   'EBAY_RETURN_PROFILE_NAME',
                'EBAY_PAYMENT_PROFILE_ID',  'EBAY_PAYMENT_PROFILE_NAME',
              ], 'policies')} />
          </div>
        </SectionCard>

        {/* Cloudinary */}
        <SectionCard icon="🖼️" title="Cloudinary — אחסון תמונות" subtitle="העלאת תמונות eBay ל-Cloudinary לאחסון קבוע">
          <div className="space-y-3">
            <Field label="Cloud Name" value={settings.CLOUDINARY_CLOUD_NAME}
              onChange={(v) => update('CLOUDINARY_CLOUD_NAME', v)} placeholder="my-cloud" />
            <Field label="API Key" value={settings.CLOUDINARY_API_KEY}
              onChange={(v) => update('CLOUDINARY_API_KEY', v)} placeholder="123456789012345" />
            <Field label="API Secret" value={settings.CLOUDINARY_API_SECRET}
              onChange={(v) => update('CLOUDINARY_API_SECRET', v)} type="password" placeholder="AbCdEfGhIjKlMnOpQrStUv" />
          </div>
          <div className="mt-4">
            <SaveButton loading={saving === 'cloudinary'}
              onClick={() => save(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], 'cloudinary')} />
          </div>
        </SectionCard>

        {/* יציאה */}
        <button
          onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-2xl border border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-500/5 transition-colors text-sm font-medium">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          יציאה מהמערכת
        </button>

      </main>
    </div>
  )
}
