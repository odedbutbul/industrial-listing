'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Product } from '@/lib/supabase'
import { EbayBadge, FacebookBadge, GeneralBadge } from '@/components/StatusBadge'
import ThemeToggle from '@/components/ThemeToggle'
import SyncModal from '@/components/SyncModal'

const CATEGORIES = [
  'מכונת CNC', 'בקר PLC', 'מנוע סרוו', 'דרייבר', 'רובוטיקה',
  'ציוד פנאומטי', 'ספק כוח', 'אינוורטר', 'ציוד מדידה', 'חלקי חילוף', 'אחר',
]

const STATS = [
  { key: 'total',   label: 'סה"כ מוצרים',    icon: '📦', color: 'text-gray-900 dark:text-white',          accent: 'bg-gray-100 dark:bg-white/10' },
  { key: 'pending', label: 'ממתינים',         icon: '⏳', color: 'text-amber-600 dark:text-amber-400',     accent: 'bg-amber-50 dark:bg-amber-500/10' },
  { key: 'ebay',    label: 'פורסמו ב-eBay',   icon: '🛒', color: 'text-green-600 dark:text-green-400',     accent: 'bg-green-50 dark:bg-green-500/10' },
  { key: 'fb',      label: 'פורסמו בפייסבוק', icon: '📘', color: 'text-blue-600 dark:text-blue-400',       accent: 'bg-blue-50 dark:bg-blue-500/10' },
  { key: 'sold',    label: 'נמכרו',           icon: '🏷️', color: 'text-purple-600 dark:text-purple-400',   accent: 'bg-purple-50 dark:bg-purple-500/10' },
]

export default function DashboardPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [filters, setFilters] = useState({ status_ebay: '', status_facebook: '', status: '', category: '', search: '' })

  async function loadProducts() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.status_ebay) params.set('status_ebay', filters.status_ebay)
    if (filters.status_facebook) params.set('status_facebook', filters.status_facebook)
    if (filters.status) params.set('status', filters.status)
    if (filters.category) params.set('category', filters.category)
    if (filters.search) params.set('search', filters.search)
    const res = await fetch(`/api/products?${params}`)
    setProducts(await res.json())
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProducts() }, [filters])

  async function deleteProduct(id: string) {
    if (!confirm('למחוק את המוצר?')) return
    await fetch(`/api/products/${id}`, { method: 'DELETE' })
    toast.success('המוצר נמחק')
    loadProducts()
  }

  async function deleteAll() {
    if (!confirm('האם אתה בטוח? פעולה זו תמחק את כל המוצרים ולא ניתן לשחזר אותם.')) return
    if (!confirm('אישור אחרון — למחוק את כל המוצרים לצמיתות?')) return
    setDeletingAll(true)
    try {
      const res = await fetch('/api/products', { method: 'DELETE' })
      if (res.ok) {
        toast.success('כל המוצרים נמחקו')
        loadProducts()
      } else {
        toast.error('שגיאה במחיקת המוצרים')
      }
    } finally {
      setDeletingAll(false)
    }
  }

  async function markSold(id: string) {
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'sold', sold_at: new Date().toISOString() }),
    })
    toast.success('סומן כנמכר')
    loadProducts()
  }

  const stats = {
    total:   products.length,
    pending: products.filter((p) => p.status_ebay === 'pending' && p.status === 'active').length,
    ebay:    products.filter((p) => p.status_ebay === 'active').length,
    fb:      products.filter((p) => p.status_facebook !== 'pending').length,
    sold:    products.filter((p) => p.status === 'sold').length,
  }

  const hasFilters = !!(filters.search || filters.category || filters.status_ebay || filters.status_facebook || filters.status)

  const selectClass = 'bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-white/10 rounded-xl px-3 h-[44px] text-sm text-gray-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0f1117]/80 backdrop-blur-md border-b border-gray-100 dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">י.פ. פתרונות טכניים</p>
              <p className="text-xs text-gray-400 dark:text-white/40">ניהול ציוד תעשייתי</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}
              className="btn-ghost hidden sm:flex items-center gap-1.5 h-9 px-3 text-xs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              יציאה
            </button>
            <Link href="/settings" className="btn-ghost hidden sm:flex items-center h-9 px-3 text-xs">
              ⚙️ הגדרות
            </Link>
            <button
              onClick={deleteAll}
              disabled={deletingAll}
              title="מחק את כל המוצרים"
              className="btn-ghost hidden sm:flex items-center gap-1.5 h-9 px-3 text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
              {deletingAll ? '...' : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
              <span className="hidden sm:inline">מחק הכל</span>
            </button>
            <button
              onClick={() => setShowSyncModal(true)}
              title="סנכרן מוצרים מ-eBay"
              className="btn-ghost flex items-center gap-1.5 h-9 px-3 text-xs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">סנכרן מ-eBay</span>
            </button>

            <Link href="/products/new"
              className="btn-primary flex items-center gap-1.5 h-9 px-4 text-sm py-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">מוצר חדש</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* כרטיסי סטטיסטיקה */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STATS.map((s) => (
            <div key={s.key} className="stat-card">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${s.accent}`}>
                {s.icon}
              </div>
              <div>
                <p className={`text-2xl font-bold tracking-tight ${s.color}`}>
                  {stats[s.key as keyof typeof stats]}
                </p>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* פילטרים */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/30 pointer-events-none">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="חיפוש יצרן / דגם..."
              className="input-base pr-10 h-[44px] py-0"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>

          <select className={selectClass} value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
            <option value="">כל הקטגוריות</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className={selectClass} value={filters.status_ebay}
            onChange={(e) => setFilters((f) => ({ ...f, status_ebay: e.target.value }))}>
            <option value="">eBay — הכל</option>
            <option value="pending">ממתין</option>
            <option value="active">פעיל</option>
            <option value="ended">הסתיים</option>
            <option value="sold">נמכר</option>
            <option value="unsold">לא נמכר</option>
            <option value="failed">נכשל</option>
          </select>

          <select className={selectClass} value={filters.status_facebook}
            onChange={(e) => setFilters((f) => ({ ...f, status_facebook: e.target.value }))}>
            <option value="">פייסבוק — הכל</option>
            <option value="pending">ממתין</option>
            <option value="published">פורסם</option>
            <option value="copied">הועתק</option>
          </select>

          <button
            onClick={() => setFilters((f) => ({ ...f, status: f.status === 'sold' ? '' : 'sold' }))}
            className={`h-[44px] px-4 rounded-xl text-sm font-medium border transition-all ${
              filters.status === 'sold'
                ? 'bg-green-500 border-green-500 text-white'
                : 'bg-white dark:bg-[#1a1d27] border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 hover:border-green-400'
            }`}>
            נמכרים בלבד
          </button>

          {hasFilters && (
            <button onClick={() => setFilters({ status_ebay: '', status_facebook: '', status: '', category: '', search: '' })}
              className="btn-ghost h-[44px] px-3 text-xs flex items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              נקה
            </button>
          )}
        </div>

        {/* תוכן */}
        <div className="card overflow-hidden animate-fade-in">
          {loading ? (
            <div className="py-20 text-center">
              <svg className="w-8 h-8 text-orange-500 animate-spin mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-400 dark:text-white/30 mt-3">טוען מוצרים...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4 text-2xl">📦</div>
              <p className="text-gray-600 dark:text-white/50 font-medium">אין מוצרים</p>
              <Link href="/products/new" className="text-orange-500 hover:text-orange-600 text-sm mt-1 inline-block">
                הוסף מוצר ראשון →
              </Link>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                      {['', 'מוצר', 'קטגוריה', 'מחיר', 'eBay', 'פייסבוק', 'סטטוס', 'תאריך', ''].map((h, i) => (
                        <th key={i} className="text-right text-xs font-semibold text-gray-400 dark:text-white/30 px-4 py-3 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id}
                        onClick={() => router.push(`/products/${p.id}`)}
                        className={`group border-b last:border-0 transition-colors duration-100 cursor-pointer ${
                          p.status === 'sold'
                            ? 'border-green-100 dark:border-green-900/30 bg-green-50/60 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/15'
                            : 'border-gray-50 dark:border-white/[0.04] hover:bg-orange-500/[0.02] dark:hover:bg-orange-500/[0.04]'
                        }`}>
                        <td className="px-4 py-3 w-14">
                          {p.images[0] ? (
                            <img src={p.images[0]} alt="" className="w-11 h-11 object-cover rounded-xl" />
                          ) : (
                            <div className="w-11 h-11 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center text-gray-300 dark:text-white/20 text-lg">
                              📷
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm">
                            {p.title || p.manufacturer}
                          </p>
                          <p className="text-gray-400 dark:text-white/40 text-xs">
                            {p.manufacturer && p.model ? `${p.manufacturer} ${p.model}` : p.model || p.manufacturer || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-white/50 text-sm">{p.category || '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-700 dark:text-white/70 text-sm">
                          {p.price ? `$${p.price.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {p.status === 'sold'
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">נמכר ב-eBay ✅</span>
                            : <EbayBadge status={p.status_ebay} />
                          }
                        </td>
                        <td className="px-4 py-3"><FacebookBadge status={p.status_facebook} /></td>
                        <td className="px-4 py-3"><GeneralBadge status={p.status} /></td>
                        <td className="px-4 py-3 text-gray-400 dark:text-white/30 text-xs whitespace-nowrap">
                          {p.status === 'sold' && p.sold_at
                            ? <span className="text-green-600 dark:text-green-400">נמכר {new Date(p.sold_at).toLocaleDateString('he-IL')}</span>
                            : new Date(p.created_at).toLocaleDateString('he-IL')
                          }
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {p.status !== 'sold' && (
                              <button onClick={() => markSold(p.id)}
                                className="min-h-[32px] px-3 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 text-xs font-medium transition-colors">
                                נמכר
                              </button>
                            )}
                            <button onClick={() => deleteProduct(p.id)}
                              className="min-h-[32px] px-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors">
                              מחק
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-white/[0.06]">
                {products.map((p) => (
                  <div key={p.id}
                    onClick={() => router.push(`/products/${p.id}`)}
                    className={`p-4 transition-colors cursor-pointer ${
                      p.status === 'sold'
                        ? 'bg-green-50/60 dark:bg-green-900/10 hover:bg-green-50 dark:hover:bg-green-900/15'
                        : 'hover:bg-orange-500/[0.02]'
                    }`}>
                    <div className="flex gap-3">
                      {p.images[0] ? (
                        <img src={p.images[0]} alt="" className="w-14 h-14 object-cover rounded-xl shrink-0" />
                      ) : (
                        <div className="w-14 h-14 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center text-xl shrink-0">📷</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">
                              {p.title || `${p.manufacturer} ${p.model}`.trim()}
                            </p>
                            <p className="text-gray-400 dark:text-white/40 text-xs mt-0.5">{p.category || '—'}</p>
                          </div>
                          {p.price && (
                            <p className="text-orange-500 font-bold text-sm shrink-0">${p.price.toLocaleString()}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {p.status === 'sold'
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">נמכר ב-eBay ✅</span>
                            : <EbayBadge status={p.status_ebay} />
                          }
                          <FacebookBadge status={p.status_facebook} />
                          <GeneralBadge status={p.status} />
                        </div>
                        {p.status === 'sold' && p.sold_at && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">נמכר {new Date(p.sold_at).toLocaleDateString('he-IL')}</p>
                        )}
                        <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                          {p.status !== 'sold' && (
                            <button onClick={() => markSold(p.id)}
                              className="flex-1 min-h-[44px] rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors">
                              נמכר
                            </button>
                          )}
                          <button onClick={() => deleteProduct(p.id)}
                            className="min-h-[44px] w-11 flex items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      {showSyncModal && (
        <SyncModal
          onClose={() => setShowSyncModal(false)}
          onSuccess={() => { loadProducts() }}
        />
      )}
    </div>
  )
}
