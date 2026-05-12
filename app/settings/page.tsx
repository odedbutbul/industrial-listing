'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

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
        body: JSON.stringify({ test: true, source: 'יפ פתרונות טכניים', timestamp: new Date().toISOString() }),
      })
      if (res.ok) toast.success('Webhook עובד!')
      else toast.error(`תגובה: ${res.status}`)
    } catch {
      toast.error('לא ניתן להגיע ל-URL')
    } finally {
      setTesting(false)
    }
  }

  const inputClass = 'w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-orange-500 transition-colors font-mono text-sm'

  return (
    <div className="min-h-screen bg-[#0f1117] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-white/40 hover:text-white transition-colors">← חזרה</Link>
          <h1 className="text-2xl font-bold text-white">הגדרות מערכת</h1>
        </div>

        <div className="space-y-6">
          {/* Webhook */}
          <div className="bg-[#1a1d24] rounded-xl border border-white/5 p-6">
            <h2 className="text-lg font-medium text-white mb-1">Webhook — Make.com / n8n</h2>
            <p className="text-white/40 text-sm mb-4">כתובת ה-webhook שאליה יישלחו פרטי המוצרים</p>
            <div className="flex gap-2">
              <input className={inputClass} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hook.make.com/..." />
              <button onClick={testWebhook} disabled={testing}
                className="px-4 py-2 rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 text-sm whitespace-nowrap disabled:opacity-50">
                {testing ? 'בודק...' : 'בדוק'}
              </button>
            </div>
            <p className="text-white/30 text-xs mt-2">ניתן לשנות את ה-WEBHOOK_URL בקובץ .env.local בשורש הפרויקט</p>
          </div>

          {/* eBay */}
          <div className="bg-[#1a1d24] rounded-xl border border-white/5 p-6">
            <h2 className="text-lg font-medium text-white mb-1">eBay API</h2>
            <p className="text-white/40 text-sm mb-4">הגדרות eBay Developer — יחובר בשלב הבא</p>
            <div className="space-y-3">
              {['EBAY_APP_ID', 'EBAY_CERT_ID', 'EBAY_DEV_ID', 'EBAY_USER_TOKEN'].map((key) => (
                <div key={key}>
                  <label className="text-white/50 text-xs mb-1 block">{key}</label>
                  <input disabled className={`${inputClass} opacity-40 cursor-not-allowed`} placeholder="יתווסף לאחר הגדרת eBay Developer Account" />
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-yellow-400 text-sm">⚠️ eBay API — placeholder מוכן לחיבור עתידי</p>
            </div>
          </div>

          {/* פרטי חברה */}
          <div className="bg-[#1a1d24] rounded-xl border border-white/5 p-6">
            <h2 className="text-lg font-medium text-white mb-4">פרטי חברה</h2>
            <div className="space-y-2 text-sm">
              {[
                ['שם חברה', 'י.פ. פתרונות טכניים'],
                ['טלפון', '054-2333651'],
                ['אימייל', 'info@yp-ts.com'],
                ['קבוצת פייסבוק', 'sells.Surplus.Industrial.Automation'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-white/40">{label}</span>
                  <span className="text-white/70">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-3">לשינוי פרטי החברה — ערוך את קובץ .env.local</p>
          </div>
        </div>
      </div>
    </div>
  )
}
