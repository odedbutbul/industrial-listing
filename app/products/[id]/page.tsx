'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Product } from '@/lib/supabase'
import ProductForm from '@/components/ProductForm'
import { EbayBadge, FacebookBadge, GeneralBadge } from '@/components/StatusBadge'

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

  async function copyAndOpenFacebook() {
    if (!product) return
    setActionLoading('facebook-copy')
    try {
      const text = buildPostText(product)
      await navigator.clipboard.writeText(text)
      await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_facebook: 'copied', facebook_published_at: new Date().toISOString() }),
      })
      toast.success('טקסט הועתק! פותח קבוצת פייסבוק...')
      setProduct((p) => p ? { ...p, status_facebook: 'copied' } : p)
      setTimeout(() => window.open('https://www.facebook.com/groups/sells.Surplus.Industrial.Automation', '_blank'), 500)
    } catch {
      toast.error('שגיאה בהעתקה')
    } finally {
      setActionLoading(null)
    }
  }

  async function sendWebhook() {
    if (!product) return
    setActionLoading('webhook')
    try {
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
    } catch {
      toast.error('שגיאה בשליחת webhook')
    } finally {
      setActionLoading(null)
    }
  }

  async function publishToEbay() {
    toast.info('ממתין לפרטי eBay API — יחובר בקרוב')
  }

  async function markSold() {
    if (!product) return
    setActionLoading('sold')
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'sold', sold_at: new Date().toISOString() }),
    })
    toast.success('סומן כנמכר')
    setProduct((p) => p ? { ...p, status: 'sold', sold_at: new Date().toISOString() } : p)
    setActionLoading(null)
  }

  if (loading) return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-white/40">טוען...</div>
  if (!product) return <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-white/40">מוצר לא נמצא</div>

  return (
    <div className="min-h-screen bg-[#0f1117] p-6">
      <div className="max-w-5xl mx-auto">
        {/* כותרת */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="text-white/40 hover:text-white transition-colors">← חזרה</Link>
          <h1 className="text-2xl font-bold text-white">{product.manufacturer} {product.model}</h1>
          <div className="flex gap-2 mr-auto">
            <EbayBadge status={product.status_ebay} />
            <FacebookBadge status={product.status_facebook} />
            <GeneralBadge status={product.status} />
          </div>
        </div>

        {/* כפתורי פרסום */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <button
            onClick={copyAndOpenFacebook}
            disabled={actionLoading === 'facebook-copy'}
            className="flex flex-col items-center gap-1 p-4 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors disabled:opacity-50">
            <span className="text-2xl">📋</span>
            <span className="text-sm font-medium">{actionLoading === 'facebook-copy' ? 'מעתיק...' : 'העתק + פייסבוק'}</span>
          </button>

          <button
            onClick={sendWebhook}
            disabled={actionLoading === 'webhook'}
            className="flex flex-col items-center gap-1 p-4 rounded-xl bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition-colors disabled:opacity-50">
            <span className="text-2xl">⚡</span>
            <span className="text-sm font-medium">{actionLoading === 'webhook' ? 'שולח...' : 'שלח Webhook'}</span>
          </button>

          <button
            onClick={publishToEbay}
            className="flex flex-col items-center gap-1 p-4 rounded-xl bg-yellow-600/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-600/30 transition-colors">
            <span className="text-2xl">🛒</span>
            <span className="text-sm font-medium">העלה ל-eBay</span>
          </button>

          <button
            onClick={markSold}
            disabled={actionLoading === 'sold' || product.status === 'sold'}
            className="flex flex-col items-center gap-1 p-4 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors disabled:opacity-50">
            <span className="text-2xl">🏷️</span>
            <span className="text-sm font-medium">{product.status === 'sold' ? 'נמכר ✓' : 'סמן כנמכר'}</span>
          </button>
        </div>

        {/* טופס עריכה */}
        <div className="bg-[#1a1d24] rounded-xl border border-white/5 p-6">
          <h2 className="text-lg font-medium text-white mb-6">עריכת פרטים</h2>
          <ProductForm product={product} />
        </div>
      </div>
    </div>
  )
}
