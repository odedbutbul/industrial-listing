'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Product } from '@/lib/supabase'
import { EbayBadge, FacebookBadge, GeneralBadge } from '@/components/StatusBadge'

const CATEGORIES = [
  'מכונת CNC', 'בקר PLC', 'מנוע סרוו', 'דרייבר', 'רובוטיקה',
  'ציוד פנאומטי', 'ספק כוח', 'אינוורטר', 'ציוד מדידה', 'חלקי חילוף', 'אחר',
]

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status_ebay: '', status_facebook: '', category: '', search: '' })

  async function loadProducts() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.status_ebay) params.set('status_ebay', filters.status_ebay)
    if (filters.status_facebook) params.set('status_facebook', filters.status_facebook)
    if (filters.category) params.set('category', filters.category)
    if (filters.search) params.set('search', filters.search)

    const res = await fetch(`/api/products?${params}`)
    const data = await res.json()
    setProducts(data)
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
    total: products.length,
    pending: products.filter((p) => p.status_ebay === 'pending' && p.status === 'active').length,
    ebay: products.filter((p) => p.status_ebay === 'published').length,
    facebook: products.filter((p) => p.status_facebook === 'published' || p.status_facebook === 'copied').length,
    sold: products.filter((p) => p.status === 'sold').length,
  }

  const inputClass = 'bg-[#1a1d24] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500'

  return (
    <div className="min-h-screen bg-[#0f1117] p-6">
      {/* כותרת */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">לוח בקרה</h1>
          <p className="text-white/50 text-sm">י.פ. פתרונות טכניים — ניהול ציוד תעשייתי</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-colors"
          >
            יציאה
          </button>
          <Link href="/settings" className="px-4 py-2 rounded-lg border border-white/20 text-white/60 hover:text-white text-sm transition-colors">
            ⚙️ הגדרות
          </Link>
          <Link href="/products/new" className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors">
            + מוצר חדש
          </Link>
        </div>
      </div>

      {/* סטטיסטיקות */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'סה"כ מוצרים', value: stats.total, color: 'text-white' },
          { label: 'ממתינים לפרסום', value: stats.pending, color: 'text-yellow-400' },
          { label: 'פורסמו ב-eBay', value: stats.ebay, color: 'text-green-400' },
          { label: 'פורסמו בפייסבוק', value: stats.facebook, color: 'text-blue-400' },
          { label: 'נמכרו', value: stats.sold, color: 'text-purple-400' },
        ].map((s) => (
          <div key={s.label} className="bg-[#1a1d24] rounded-xl p-4 border border-white/5">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-white/50 text-sm mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* פילטרים */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="חיפוש יצרן / דגם..."
          className={`${inputClass} min-w-[200px]`}
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <select className={inputClass} value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          <option value="">כל הקטגוריות</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={inputClass} value={filters.status_ebay} onChange={(e) => setFilters((f) => ({ ...f, status_ebay: e.target.value }))}>
          <option value="">סטטוס eBay — הכל</option>
          <option value="pending">ממתין</option>
          <option value="published">פורסם</option>
          <option value="failed">נכשל</option>
        </select>
        <select className={inputClass} value={filters.status_facebook} onChange={(e) => setFilters((f) => ({ ...f, status_facebook: e.target.value }))}>
          <option value="">סטטוס פייסבוק — הכל</option>
          <option value="pending">ממתין</option>
          <option value="published">פורסם</option>
          <option value="copied">הועתק</option>
        </select>
        {(filters.search || filters.category || filters.status_ebay || filters.status_facebook) && (
          <button onClick={() => setFilters({ status_ebay: '', status_facebook: '', category: '', search: '' })}
            className="px-3 py-2 rounded-lg border border-white/20 text-white/50 hover:text-white text-sm">
            נקה פילטרים ✕
          </button>
        )}
      </div>

      {/* טבלה */}
      <div className="bg-[#1a1d24] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-white/40">טוען מוצרים...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-white/40">
            <p className="text-lg mb-2">אין מוצרים</p>
            <Link href="/products/new" className="text-orange-400 hover:underline">הוסף מוצר ראשון</Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                {['תמונה', 'יצרן / דגם', 'קטגוריה', 'מחיר', 'eBay', 'פייסבוק', 'סטטוס', 'תאריך', 'פעולות'].map((h) => (
                  <th key={h} className="text-right text-white/40 text-xs font-medium px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    {p.images[0] ? (
                      <img src={p.images[0]} alt="" className="w-12 h-12 object-cover rounded-lg" />
                    ) : (
                      <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-white/20 text-xl">📷</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{p.manufacturer}</p>
                    <p className="text-white/50 text-sm">{p.model}</p>
                  </td>
                  <td className="px-4 py-3 text-white/60 text-sm">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-white/80 text-sm">{p.price ? `₪${p.price.toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3"><EbayBadge status={p.status_ebay} /></td>
                  <td className="px-4 py-3"><FacebookBadge status={p.status_facebook} /></td>
                  <td className="px-4 py-3"><GeneralBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(p.created_at).toLocaleDateString('he-IL')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/products/${p.id}`} className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors">
                        עריכה
                      </Link>
                      {p.status !== 'sold' && (
                        <button onClick={() => markSold(p.id)} className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors">
                          נמכר
                        </button>
                      )}
                      <button onClick={() => deleteProduct(p.id)} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
