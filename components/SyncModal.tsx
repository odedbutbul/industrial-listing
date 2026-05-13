'use client'

import { useState, useRef } from 'react'

type Phase = 'options' | 'preview' | 'syncing' | 'done'

type SyncOptions = {
  dateFrom: string
  search: string
  onlyNew: boolean
  updateExisting: boolean
}

type SyncResult = {
  page: number
  totalPages: number
  totalItems: number
  imported: number
  updated: number
  skipped: number
  done: boolean
}

type PreviewResult = {
  page: number
  totalPages: number
  totalItems: number
  matchingOnPage: number
}

const DATE_SHORTCUTS = [
  { label: '7 ימים', days: 7 },
  { label: '30 ימים', days: 30 },
  { label: '90 ימים', days: 90 },
  { label: 'הכל', days: 0 },
]

function daysAgo(days: number): string {
  if (days === 0) return ''
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

export default function SyncModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [phase, setPhase] = useState<Phase>('options')
  const [opts, setOpts] = useState<SyncOptions>({ dateFrom: '', search: '', onlyNew: true, updateExisting: false })
  const [activeDays, setActiveDays] = useState<number | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [syncState, setSyncState] = useState({ page: 0, totalPages: 0, totalItems: 0, imported: 0, updated: 0, skipped: 0 })
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef(false)

  function pickShortcut(days: number) {
    setActiveDays(days)
    setOpts((o) => ({ ...o, dateFrom: daysAgo(days) }))
  }

  async function handlePreview() {
    setError(null)
    setPhase('preview')
    try {
      const res = await fetch('/api/ebay/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...opts, page: 1, preview: true }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setPhase('options'); return }
      setPreview(data)
    } catch {
      setError('שגיאה בחיבור לשרת')
      setPhase('options')
    }
  }

  async function runSync(startPage = 1) {
    stopRef.current = false
    setPhase('syncing')
    setError(null)
    let totalImported = 0, totalUpdated = 0, totalSkipped = 0
    let currentPage = startPage
    let pagesTotal = preview?.totalPages ?? 1

    setSyncState({ page: currentPage, totalPages: pagesTotal, totalItems: preview?.totalItems ?? 0, imported: 0, updated: 0, skipped: 0 })

    while (currentPage <= pagesTotal) {
      if (stopRef.current) break

      let data: SyncResult
      try {
        const res = await fetch('/api/ebay/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...opts, page: currentPage, preview: false }),
        })
        data = await res.json()
      } catch {
        setError('שגיאה בחיבור לשרת')
        break
      }

      if ((data as { error?: string }).error) {
        setError((data as { error?: string }).error ?? 'שגיאה לא ידועה')
        break
      }

      pagesTotal = data.totalPages
      totalImported += data.imported
      totalUpdated += data.updated
      totalSkipped += data.skipped

      setSyncState({
        page: currentPage,
        totalPages: pagesTotal,
        totalItems: data.totalItems,
        imported: totalImported,
        updated: totalUpdated,
        skipped: totalSkipped,
      })

      if (data.done || currentPage >= pagesTotal) break
      currentPage++
    }

    setPhase('done')
    onSuccess()
  }

  async function handleSyncOne() {
    stopRef.current = false
    setPhase('syncing')
    setError(null)

    try {
      const res = await fetch('/api/ebay/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...opts, page: 1, preview: false }),
      })
      const data: SyncResult = await res.json()
      if ((data as { error?: string }).error) {
        setError((data as { error?: string }).error ?? 'שגיאה')
        setPhase('preview')
        return
      }
      setSyncState({ page: data.page, totalPages: data.totalPages, totalItems: data.totalItems, imported: data.imported, updated: data.updated, skipped: data.skipped })
      setPhase('done')
      onSuccess()
    } catch {
      setError('שגיאה בחיבור לשרת')
      setPhase('preview')
    }
  }

  const progressPct = syncState.totalPages > 0 ? Math.round((syncState.page / syncState.totalPages) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={phase === 'syncing' ? undefined : onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-[#1a1d27] rounded-3xl shadow-2xl border border-gray-100 dark:border-white/[0.08] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-lg">🛒</div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-base leading-none">סנכרון מ-eBay</h2>
              <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                {phase === 'options' && 'הגדרות סנכרון'}
                {phase === 'preview' && 'תצוגה מקדימה'}
                {phase === 'syncing' && 'מסנכרן...'}
                {phase === 'done' && 'הסנכרון הושלם'}
              </p>
            </div>
          </div>
          {phase !== 'syncing' && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:text-white/40 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* OPTIONS phase */}
          {phase === 'options' && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider mb-2">תאריך רישום ב-eBay</p>
                <div className="flex gap-2 flex-wrap">
                  {DATE_SHORTCUTS.map(({ label, days }) => (
                    <button key={label} type="button"
                      onClick={() => pickShortcut(days)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                        activeDays === days
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-orange-400'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {opts.dateFrom && (
                  <p className="text-xs text-gray-400 dark:text-white/30 mt-1.5">מתאריך: {opts.dateFrom}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider block mb-2">חיפוש לפי כותרת</label>
                <input
                  className="w-full bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-xl px-3 h-10 text-sm text-gray-700 dark:text-white/80 placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                  value={opts.search}
                  onChange={(e) => setOpts((o) => ({ ...o, search: e.target.value }))}
                  placeholder="Siemens, Fanuc, ABB..."
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wider">אפשרויות</p>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={opts.onlyNew}
                      onChange={(e) => setOpts((o) => ({ ...o, onlyNew: e.target.checked }))} />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-white/10 rounded-full peer-checked:bg-orange-500 transition-colors" />
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-[-20px]" />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-white/70">רק מוצרים חדשים (דלג על קיימים)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={opts.updateExisting}
                      onChange={(e) => setOpts((o) => ({ ...o, updateExisting: e.target.checked }))} />
                    <div className="w-10 h-5 bg-gray-200 dark:bg-white/10 rounded-full peer-checked:bg-orange-500 transition-colors" />
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-[-20px]" />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-white/70">עדכן מוצרים קיימים</span>
                </label>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={handlePreview}
                  className="flex-1 h-11 rounded-2xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors">
                  תצוגה מקדימה →
                </button>
                <button onClick={onClose}
                  className="h-11 px-5 rounded-2xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/50 text-sm hover:border-gray-300 dark:hover:border-white/20 transition-colors">
                  ביטול
                </button>
              </div>
            </>
          )}

          {/* PREVIEW phase */}
          {phase === 'preview' && preview && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'סה"כ מוצרים', value: preview.totalItems },
                  { label: 'דפים', value: preview.totalPages },
                  { label: 'בדף הראשון', value: preview.matchingOnPage },
                ].map((s) => (
                  <div key={s.label} className="p-4 rounded-2xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {preview.totalItems === 0 ? (
                <p className="text-center text-sm text-gray-400 dark:text-white/40 py-2">לא נמצאו מוצרים לסנכרון</p>
              ) : (
                <p className="text-sm text-gray-600 dark:text-white/60 text-center">
                  נמצאו <strong className="text-gray-900 dark:text-white">{preview.totalItems}</strong> מוצרים ב-<strong className="text-gray-900 dark:text-white">{preview.totalPages}</strong> דפים
                </p>
              )}

              <div className="flex flex-col gap-2.5 pt-1">
                {preview.totalPages > 1 && (
                  <button onClick={() => runSync(1)}
                    className="w-full h-11 rounded-2xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    סנכרן הכל ({preview.totalPages} דפים)
                  </button>
                )}
                <button onClick={handleSyncOne}
                  className={`w-full h-11 rounded-2xl font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                    preview.totalPages <= 1
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/20'
                  }`}>
                  סנכרן דף ראשון בלבד (200 מוצרים)
                </button>
                <button onClick={() => setPhase('options')}
                  className="w-full h-10 rounded-2xl text-sm text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition-colors">
                  ← חזרה לאפשרויות
                </button>
              </div>
            </>
          )}

          {phase === 'preview' && !preview && !error && (
            <div className="py-10 text-center">
              <svg className="w-7 h-7 text-orange-500 animate-spin mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-400 dark:text-white/40 mt-3">טוען נתונים מ-eBay...</p>
            </div>
          )}

          {/* SYNCING phase */}
          {phase === 'syncing' && (
            <div className="space-y-5 py-2">
              <div className="text-center">
                <svg className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  מסנכרן דף {syncState.page} מתוך {syncState.totalPages || '?'}
                </p>
                {syncState.totalItems > 0 && (
                  <p className="text-xs text-gray-400 dark:text-white/40 mt-1">
                    סה&quot;כ {syncState.totalItems} מוצרים ב-eBay
                  </p>
                )}
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 dark:text-white/40 mb-1.5">
                  <span>התקדמות</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'יובאו', value: syncState.imported, color: 'text-green-600 dark:text-green-400' },
                  { label: 'עודכנו', value: syncState.updated, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'דולגו', value: syncState.skipped, color: 'text-gray-400 dark:text-white/30' },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { stopRef.current = true }}
                className="w-full h-10 rounded-2xl border border-red-200 dark:border-red-500/20 text-red-500 text-sm hover:bg-red-500/5 transition-colors">
                עצור סנכרון
              </button>
            </div>
          )}

          {/* DONE phase */}
          {phase === 'done' && (
            <div className="space-y-5 py-2">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center text-3xl mx-auto mb-3">✅</div>
                <p className="font-bold text-gray-900 dark:text-white">הסנכרון הושלם!</p>
                <p className="text-xs text-gray-400 dark:text-white/40 mt-1">
                  {syncState.totalPages > 1 ? `עובדו ${syncState.page} דפים` : 'עובד דף אחד'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'מוצרים חדשים', value: syncState.imported, color: 'text-green-600 dark:text-green-400' },
                  { label: 'עודכנו', value: syncState.updated, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'דולגו', value: syncState.skipped, color: 'text-gray-400 dark:text-white/30' },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <button onClick={onClose}
                className="w-full h-11 rounded-2xl bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition-colors">
                סגור
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
