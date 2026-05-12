'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Product } from '@/lib/supabase'
import ImageUploader from './ImageUploader'
import PostPreview from './PostPreview'

const CATEGORIES = [
  'מכונת CNC', 'בקר PLC', 'מנוע סרוו', 'דרייבר', 'רובוטיקה',
  'ציוד פנאומטי', 'ספק כוח', 'אינוורטר', 'ציוד מדידה', 'חלקי חילוף', 'אחר',
]

const CONDITIONS = ['חדש', 'משומש - מצוין', 'משומש - טוב', 'משומש - בינוני', 'לחלקים']

type FormData = {
  manufacturer: string
  model: string
  category: string | null
  year: number | undefined
  condition: string
  price: number | undefined
  description: string | null
  location: string | null
  phone: string | null
  images: string[]
  notes: string | null
}

interface Props {
  product?: Product
}

export default function ProductForm({ product }: Props) {
  const router = useRouter()
  const isEdit = !!product

  const [form, setForm] = useState<FormData>({
    manufacturer: product?.manufacturer ?? '',
    model: product?.model ?? '',
    category: product?.category ?? '',
    year: product?.year ?? undefined,
    condition: product?.condition ?? 'משומש - טוב',
    price: product?.price ?? undefined,
    description: product?.description ?? '',
    location: product?.location ?? '',
    phone: product?.phone ?? '',
    images: product?.images ?? [],
    notes: product?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [productId] = useState(product?.id ?? crypto.randomUUID())

  function update(field: keyof FormData, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.manufacturer || !form.model) {
      toast.error('יצרן ודגם הם שדות חובה')
      return
    }
    setSaving(true)

    try {
      if (isEdit) {
        const res = await fetch(`/api/products/${product.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error()
        toast.success('המוצר עודכן בהצלחה')
        router.refresh()
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, id: productId }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        toast.success('המוצר נשמר בהצלחה')
        router.push(`/products/${data.id}`)
      }
    } catch {
      toast.error('שגיאה בשמירת המוצר')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full bg-[#1a1d24] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-orange-500 transition-colors'
  const labelClass = 'block text-sm text-white/60 mb-1'

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* טופס - 2 עמודות */}
      <div className="lg:col-span-2 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>יצרן *</label>
            <input className={inputClass} value={form.manufacturer} onChange={(e) => update('manufacturer', e.target.value)} placeholder="Siemens, Fanuc..." required />
          </div>
          <div>
            <label className={labelClass}>דגם *</label>
            <input className={inputClass} value={form.model} onChange={(e) => update('model', e.target.value)} placeholder="S7-300, 0i-MF..." required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>קטגוריה</label>
            <select className={inputClass} value={form.category ?? ''} onChange={(e) => update('category', e.target.value)}>
              <option value="">בחר קטגוריה</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>שנת ייצור</label>
            <input type="number" className={inputClass} value={form.year ?? ''} onChange={(e) => update('year', e.target.value ? parseInt(e.target.value) : undefined)} placeholder="2018" min={1950} max={2030} />
          </div>
        </div>

        <div>
          <label className={labelClass}>מצב</label>
          <div className="flex gap-2 flex-wrap">
            {CONDITIONS.map((c) => (
              <button key={c} type="button"
                onClick={() => update('condition', c)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.condition === c ? 'bg-orange-500 border-orange-500 text-white' : 'bg-transparent border-white/20 text-white/60 hover:border-white/40'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>מחיר (₪)</label>
            <input type="number" className={inputClass} value={form.price ?? ''} onChange={(e) => update('price', e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="5000" />
          </div>
          <div>
            <label className={labelClass}>מיקום</label>
            <input className={inputClass} value={form.location ?? ''} onChange={(e) => update('location', e.target.value)} placeholder="תל אביב" />
          </div>
        </div>

        <div>
          <label className={labelClass}>טלפון</label>
          <input className={inputClass} value={form.phone ?? ''} onChange={(e) => update('phone', e.target.value)} placeholder="054-2333651" />
        </div>

        <div>
          <label className={labelClass}>תיאור ומפרט טכני</label>
          <textarea className={`${inputClass} resize-none`} rows={5} value={form.description ?? ''} onChange={(e) => update('description', e.target.value)} placeholder="פירוט טכני, מצב, הערות..." />
        </div>

        <div>
          <label className={labelClass}>הערות פנימיות</label>
          <input className={inputClass} value={form.notes ?? ''} onChange={(e) => update('notes', e.target.value)} placeholder="הערות לשימוש פנימי בלבד" />
        </div>

        <div>
          <label className={labelClass}>תמונות</label>
          <ImageUploader productId={productId} images={form.images} onChange={(imgs) => update('images', imgs)} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors">
            {saving ? 'שומר...' : isEdit ? 'עדכן מוצר' : 'שמור מוצר'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-6 py-3 rounded-lg border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors">
            ביטול
          </button>
        </div>
      </div>

      {/* תצוגה מקדימה */}
      <div className="lg:col-span-1">
        <p className="text-sm text-white/60 mb-2">תצוגה מקדימה — פוסט פייסבוק</p>
        <PostPreview
          manufacturer={form.manufacturer}
          model={form.model}
          category={form.category ?? ''}
          condition={form.condition}
          year={form.year}
          location={form.location ?? ''}
          price={form.price}
          description={form.description ?? ''}
          phone={form.phone ?? ''}
        />
      </div>
    </form>
  )
}
