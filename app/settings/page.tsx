'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import ThemeToggle from '@/components/ThemeToggle'

type Settings = {
  WEBHOOK_URL: string
  EBAY_APP_ID: string
  EBAY_CERT_ID: string
  EBAY_DEV_ID: string
  EBAY_USER_TOKEN: string
  EBAY_SANDBOX: string
  CLOUDINARY_CLOUD_NAME: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
}

const EMPTY: Settings = {
  WEBHOOK_URL: '',
  EBAY_APP_ID: '',
  EBAY_CERT_ID: '',
  EBAY_DEV_ID: '',
  EBAY_USER_TOKEN: '',
  EBAY_SANDBOX: 'true',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
}

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

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [ebayStatus, setEbayStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  useEffect(() => {
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

  async function testWebhook() {
    if (!settings.WEBHOOK_URL) { toast.error('הכנס URL תחילה'); return }
    setTesting('webhook')
    try {
      const res = await fetch(settings.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, source: 'י.פ. פתרונות טכניים', timestamp: new Date().toISOString() }),
      })
      if (res.ok) toast.success('Webhook עובד! ✓')
      else toast.error(`תגובה: ${res.status}`)
    } catch {
      toast.error('לא ניתן להגיע ל-URL')
    } finally {
      setTesting(null)
    }
  }

  async function testEbay() {
    if (!settings.EBAY_APP_ID || !settings.EBAY_CERT_ID) {
      toast.error('נדרש App ID ו-Cert ID לבדיקה')
      return
    }
    setTesting('ebay')
    setEbayStatus('idle')
    try {
      const res = await fetch('/api/settings/ebay-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: settings.EBAY_APP_ID,
          cert_id: settings.EBAY_CERT_ID,
          sandbox: settings.EBAY_SANDBOX,
        }),
      })
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

        {/* Webhook */}
        <SectionCard icon="⚡" title="Webhook — Make.com / n8n" subtitle="כתובת לשליחת פרטי מוצרים אוטומטית">
          <Field
            label="Webhook URL"
            value={settings.WEBHOOK_URL}
            onChange={(v) => update('WEBHOOK_URL', v)}
            placeholder="https://hook.make.com/..."
          />
          <div className="flex gap-2 mt-4">
            <SaveButton loading={saving === 'webhook'} onClick={() => save(['WEBHOOK_URL'], 'webhook')} />
            <button onClick={testWebhook} disabled={testing === 'webhook' || !settings.WEBHOOK_URL}
              className="btn-ghost h-[44px] px-4 text-sm flex items-center gap-2 disabled:opacity-40">
              {testing === 'webhook' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  בודק...
                </>
              ) : 'בדוק חיבור'}
            </button>
          </div>
        </SectionCard>

        {/* eBay API */}
        <SectionCard icon="🛒" title="eBay API" subtitle="פרטי חיבור ל-eBay Developer Account">

          {/* Sandbox toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 mb-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">מצב חיבור</p>
              <p className="text-xs text-gray-500 dark:text-white/40">
                {settings.EBAY_SANDBOX === 'true' ? 'Sandbox — לפיתוח ובדיקות' : 'Production — חשבון אמיתי'}
              </p>
            </div>
            <button
              onClick={() => update('EBAY_SANDBOX', settings.EBAY_SANDBOX === 'true' ? 'false' : 'true')}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none
                ${settings.EBAY_SANDBOX === 'true' ? 'bg-amber-400' : 'bg-green-500'}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                ${settings.EBAY_SANDBOX === 'true' ? 'translate-x-1' : 'translate-x-6'}`} />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="App ID (Client ID)" value={settings.EBAY_APP_ID}
              onChange={(v) => update('EBAY_APP_ID', v)} placeholder="YourApp-123456-..." />
            <Field label="Cert ID (Client Secret)" value={settings.EBAY_CERT_ID}
              onChange={(v) => update('EBAY_CERT_ID', v)} type="password" placeholder="SBX-abc123..." />
            <Field label="Dev ID" value={settings.EBAY_DEV_ID}
              onChange={(v) => update('EBAY_DEV_ID', v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <Field label="User Token" value={settings.EBAY_USER_TOKEN}
              onChange={(v) => update('EBAY_USER_TOKEN', v)} type="password" placeholder="AgAAAA**AQAAAA**..." />
          </div>

          {/* סטטוס בדיקה */}
          {ebayStatus !== 'idle' && (
            <div className={`mt-4 flex items-center gap-2 p-3 rounded-xl border text-sm
              ${ebayStatus === 'ok'
                ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400'
              }`}>
              <span className="text-base">{ebayStatus === 'ok' ? '✅' : '❌'}</span>
              {ebayStatus === 'ok'
                ? `מחובר בהצלחה ל-eBay (${settings.EBAY_SANDBOX === 'true' ? 'Sandbox' : 'Production'})`
                : 'החיבור נכשל — בדוק את ה-App ID וה-Cert ID'}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <SaveButton loading={saving === 'ebay'}
              onClick={() => save(['EBAY_APP_ID', 'EBAY_CERT_ID', 'EBAY_DEV_ID', 'EBAY_USER_TOKEN', 'EBAY_SANDBOX'], 'ebay')} />
            <button onClick={testEbay}
              disabled={testing === 'ebay' || !settings.EBAY_APP_ID || !settings.EBAY_CERT_ID}
              className="btn-ghost h-[44px] px-4 text-sm flex items-center gap-2 disabled:opacity-40">
              {testing === 'ebay' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  בודק...
                </>
              ) : 'בדוק חיבור'}
            </button>
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

        {/* פרטי חברה */}
        <SectionCard icon="🏢" title="פרטי חברה" subtitle="מופיעים בכל פוסט פייסבוק">
          <div className="divide-y divide-gray-50 dark:divide-white/[0.04]">
            {[
              ['שם חברה', 'י.פ. פתרונות טכניים'],
              ['טלפון', '054-2333651'],
              ['אימייל', 'info@yp-ts.com'],
              ['קבוצת פייסבוק', 'sells.Surplus.Industrial.Automation'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2.5">
                <span className="text-sm text-gray-500 dark:text-white/40">{label}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white/70 text-left">{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-white/25 mt-3">לשינוי — ערוך את קובץ .env.local</p>
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
