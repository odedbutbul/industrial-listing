'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Product } from '@/lib/supabase'
import ProductForm from '@/components/ProductForm'
import { EbayBadge, FacebookBadge, GeneralBadge } from '@/components/StatusBadge'
import ThemeToggle from '@/components/ThemeToggle'

function buildPostText(p: Product): string {
  return `🔧 ${p.manufacturer} ${p.model}${p.category ? ` | ${p.category}` : ''}

📌 מצב: ${p.condition}
📅 שנת ייצור: ${p.year || 'לא צוין'}
📍 מיקום: ${p.location || 'לא צוין'}
💰 מחיר: ₪${p.price || 'לא צוין'}

📋 פרטים נוספים:
${p.description || ''}

─────────────────
י.פ. פתרונות טכניים
📞 ${p.phone || '054-2333651'}
✉️ info@yp-ts.com`
}

const ACTION_BUTTONS = [
  { key: 'facebook-copy', icon: '📋', label: 'העתק + פייסבוק', activeLabel: 'מעתיק...', color: 'bg-blue-500/10 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20' },
  { key: 'webhook',       icon: '⚡', label: 'שלח Webhook',     activeLabel: 'שולח...',   color: 'bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/20' },
  { key: 'ebay',          icon: '🛒', label: 'העלה ל-eBay',     activeLabel: null,         color: 'bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20' },
  { key: 'sold',          icon: '🏷️', label: 'סמן כנמכר',      activeLabel: null,         color: 'bg-purple-500/10 border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20' },
]

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((data) => { setProduct(data); setLoading(false) })
  }, [id])

  async function handleAction(key: string) {
    if (!product) return
    setActionLoading(key)

    try {
      if (key === 'facebook-copy') {
        await navigator.clipboard.writeText(buildPostText(product))
        await fetch(`/api/products/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status_facebook: 'copied', facebook_published_at: new Date().toISOString() }),
        })
        toast.success('טקסט הועתק! פותח קבוצת פייסבוק...')
        setProduct((p) => p ? { ...p, status_facebook: 'copied' } : p)
        setTimeout(() => window.open('https://www.facebook.com/groups/sells.Surplus.Industrial.Automation', '_blank'), 500)
      } else if (key === 'webhook') {
        const res = await fetch('/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: id }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success('Webhook נשלח בהצלחה')
          setProduct((p) => p ? { ...p, status_facebook: 'published' } : p)
        } else {
          toast.error(data.error || 'שגיאה בשליחת webhook')
        }
      } else if (key === 'ebay') {
        toast.info('ממתין לפרטי eBay API — יחובר בקרוב')
      } else if (key === 'sold') {
        await fetch(`/api/products/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'sold', sold_at: new Date().toISOString() }),
        })
        toast.success('סומן כנמכר')
        setProduct((p) => p ? { ...p, status: 'sold', sold_at: new Date().toISOString() } : p)
      }
    } catch {
      toast.error('שגיאה בביצוע הפעולה')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center">
      <svg className="w-8 h-8 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )

  if (!product) return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center text-gray-400 dark:text-white/30">
      מוצר לא נמצא
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] transition-colors duration-200">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0f1117]/80 backdrop-blur-md border-b border-gray-100 dark:border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link href="/dashboard"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-white/20 transition-all shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">
              {product.manufacturer} {product.model}
            </h1>
            <div className="flex gap-1.5 mt-0.5 flex-wrap">
              <EbayBadge status={product.status_ebay} />
              <FacebookBadge status={product.status_facebook} />
              <GeneralBadge status={product.status} />
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-fade-in">
        {/* כפתורי פרסום */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ACTION_BUTTONS.map(({ key, icon, label, activeLabel, color }) => {
            const isActive = actionLoading === key
            const isSold = key === 'sold' && product.status === 'sold'
            return (
              <button key={key}
                onClick={() => handleAction(key)}
                disabled={isActive || isSold}
                className={`flex flex-col items-center justify-center gap-2 p-4 min-h-[80px]
                            rounded-2xl border font-medium transition-all duration-150
                            disabled:opacity-50 disabled:cursor-not-allowed
                            active:scale-[0.98] ${color}`}>
                <span className="text-2xl">{isSold ? '✓' : icon}</span>
                <span className="text-xs text-center leading-tight">
                  {isActive && activeLabel ? activeLabel : isSold ? 'נמכר ✓' : label}
                </span>
              </button>
            )
          })}
        </div>

        {/* טופס עריכה */}
        <div className="card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide mb-5">עריכת פרטים</h2>
          <ProductForm product={product} />
        </div>
      </main>
    </div>
  )
}
