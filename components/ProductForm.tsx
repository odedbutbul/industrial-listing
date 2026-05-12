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

export default function ProductForm({ product }: { product?: Product }) {
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

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* שדות */}
      <div className="xl:col-span-2 space-y-5">

        {/* יצרן + דגם */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">יצרן <span className="text-orange-500">*</span></label>
            <input className="input-base" value={form.manufacturer}
              onChange={(e) => update('manufacturer', e.target.value)}
              placeholder="Siemens, Fanuc, ABB..." required />
          </div>
          <div>
            <label className="label-base">דגם <span className="text-orange-500">*</span></label>
            <input className="input-base" value={form.model}
              onChange={(e) => update('model', e.target.value)}
              placeholder="S7-300, 0i-MF..." required />
          </div>
        </div>

        {/* קטגוריה + שנה */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">קטגוריה</label>
            <select className="input-base" value={form.category ?? ''}
              onChange={(e) => update('category', e.target.value)}>
              <option value="">בחר קטגוריה</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label-base">שנת ייצור</label>
            <input type="number" className="input-base" value={form.year ?? ''}
              onChange={(e) => update('year', e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="2018" min={1950} max={2030} />
          </div>
        </div>

        {/* מצב */}
        <div>
          <label className="label-base">מצב המוצר</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {CONDITIONS.map((c) => (
              <button key={c} type="button" onClick={() => update('condition', c)}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-medium border transition-all duration-150
                  ${form.condition === c
                    ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-transparent border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60 hover:border-orange-400 dark:hover:border-orange-500/50'
                  }`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* מחיר + מיקום */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">מחיר (₪)</label>
            <input type="number" className="input-base" value={form.price ?? ''}
              onChange={(e) => update('price', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="5,000" />
          </div>
          <div>
            <label className="label-base">מיקום</label>
            <input className="input-base" value={form.location ?? ''}
              onChange={(e) => update('location', e.target.value)} placeholder="תל אביב" />
          </div>
        </div>

        {/* טלפון */}
        <div>
          <label className="label-base">טלפון</label>
          <input className="input-base" value={form.phone ?? ''}
            onChange={(e) => update('phone', e.target.value)} placeholder="054-2333651" />
        </div>

        {/* תיאור */}
        <div>
          <label className="label-base">תיאור ומפרט טכני</label>
          <textarea className="input-base resize-none" rows={5}
            value={form.description ?? ''}
            onChange={(e) => update('description', e.target.value)}
            placeholder="פירוט טכני, מצב, הערות, מה כלול במכירה..." />
        </div>

        {/* הערות פנימיות */}
        <div>
          <label className="label-base">הערות פנימיות</label>
          <input className="input-base" value={form.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="הערות לשימוש פנימי בלבד" />
        </div>

        {/* תמונות */}
        <div>
          <label className="label-base">תמונות</label>
          <ImageUploader productId={productId} images={form.images}
            onChange={(imgs) => update('images', imgs)} />
        </div>

        {/* כפתורים */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1 py-3 text-base">
            {saving ? 'שומר...' : isEdit ? 'עדכן מוצר' : 'שמור מוצר'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost py-3 px-6">
            ביטול
          </button>
        </div>
      </div>

      {/* תצוגה מקדימה */}
      <div className="xl:col-span-1">
        <label className="label-base">תצוגה מקדימה — פייסבוק</label>
        <div className="mt-1 sticky top-6">
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
      </div>
    </form>
  )
}
