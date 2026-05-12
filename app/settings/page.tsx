'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import ThemeToggle from '@/components/ThemeToggle'

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [testing, setTesting] = useState(false)

  async function testWebhook() {
    if (!webhookUrl) { toast.error('הכנס URL תחילה'); return }
    setTesting(true)
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, source: 'י.פ. פתרונות טכניים', timestamp: new Date().toISOString() }),
      })
      if (res.ok) toast.success('Webhook עובד! ✓')
      else toast.error(`תגובה: ${res.status}`)
    } catch {
      toast.error('לא ניתן להגיע ל-URL')
    } finally {
      setTesting(false)
    }
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
        <div className="card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center text-xl">⚡</div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Webhook — Make.com / n8n</h2>
              <p className="text-xs text-gray-500 dark:text-white/40">כתובת לשליחת פרטי מוצרים אוטומטית</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              className="input-base flex-1 font-mono text-xs"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hook.make.com/..."
            />
            <button onClick={testWebhook} disabled={testing}
              className="btn-primary px-4 py-0 h-[44px] text-sm shrink-0 bg-green-500 hover:bg-green-600">
              {testing ? 'בודק...' : 'בדוק'}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-white/25 mt-2">
            לשינוי קבוע — ערוך WEBHOOK_URL בקובץ .env.local
          </p>
        </div>

        {/* eBay */}
        <div className="card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-xl">🛒</div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">eBay API</h2>
              <p className="text-xs text-gray-500 dark:text-white/40">יחובר בשלב הבא</p>
            </div>
          </div>
          <div className="space-y-3 opacity-50 pointer-events-none">
            {['EBAY_APP_ID', 'EBAY_CERT_ID', 'EBAY_DEV_ID', 'EBAY_USER_TOKEN'].map((key) => (
              <div key={key}>
                <label className="label-base">{key}</label>
                <input disabled className="input-base text-xs font-mono" placeholder="יתווסף אחרי הגדרת eBay Developer Account" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <span className="text-amber-500">⚠️</span>
            <p className="text-sm text-amber-600 dark:text-amber-400">Placeholder — מוכן לחיבור עתידי</p>
          </div>
        </div>

        {/* פרטי חברה */}
        <div className="card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-xl">🏢</div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">פרטי חברה</h2>
              <p className="text-xs text-gray-500 dark:text-white/40">מופיעים בכל פוסט פייסבוק</p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              ['שם חברה', 'י.פ. פתרונות טכניים'],
              ['טלפון', '054-2333651'],
              ['אימייל', 'info@yp-ts.com'],
              ['קבוצת פייסבוק', 'sells.Surplus.Industrial.Automation'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-white/[0.04] last:border-0">
                <span className="text-sm text-gray-500 dark:text-white/40">{label}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white/70">{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-white/25 mt-3">לשינוי — ערוך את קובץ .env.local</p>
        </div>

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
