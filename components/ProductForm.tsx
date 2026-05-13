'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Product } from '@/lib/supabase'
import ImageUploader from './ImageUploader'
import PostPreview from './PostPreview'
import RichTextEditor from './RichTextEditor'

const CATEGORIES = [
  'מכונת CNC', 'בקר PLC', 'מנוע סרוו', 'דרייבר', 'רובוטיקה',
  'ציוד פנאומטי', 'ספק כוח', 'אינוורטר', 'ציוד מדידה', 'חלקי חילוף', 'אחר',
]

const EBAY_CONDITIONS = [
  { value: 'New', label: 'חדש' },
  { value: 'Like New', label: 'כמו חדש' },
  { value: 'Very Good', label: 'טוב מאוד' },
  { value: 'Good', label: 'טוב' },
  { value: 'Acceptable', label: 'סביר' },
  { value: 'For parts or not working', label: 'לחלקים' },
]

const COUNTRIES = [
  'Israel', 'Germany', 'Japan', 'USA', 'China', 'Italy', 'France', 'UK', 'South Korea', 'Taiwan',
]

const SHIPPING_METHODS_DOM = ['Standard Shipping', 'Expedited Shipping', 'Free Shipping']
const SHIPPING_METHODS_INT = ['Standard International Shipping', 'Expedited International Shipping', 'Economy International Shipping']

type ShippingInfo = { method: string; price: number | undefined }

type FormData = {
  title: string
  manufacturer: string
  model: string
  category: string
  year: number | undefined
  condition: string
  price: number | undefined
  description: string
  location: string
  phone: string
  images: string[]
  notes: string
  sku: string
  ebay_category: string
  brand: string
  mpn: string
  country_of_origin: string
  quantity: number | undefined
  shipping_domestic: ShippingInfo
  shipping_international: ShippingInfo
}

export default function ProductForm({ product }: { product?: Product }) {
  const router = useRouter()
  const isEdit = !!product

  const [form, setForm] = useState<FormData>({
    title: product?.title ?? '',
    manufacturer: product?.manufacturer ?? '',
    model: product?.model ?? '',
    category: product?.category ?? '',
    year: product?.year ?? undefined,
    condition: product?.condition ?? 'Good',
    price: product?.price ?? undefined,
    description: product?.description ?? '',
    location: product?.location ?? '',
    phone: product?.phone ?? '',
    images: product?.images ?? [],
    notes: product?.notes ?? '',
    sku: product?.sku ?? '',
    ebay_category: product?.ebay_category ?? '',
    brand: product?.brand ?? '',
    mpn: product?.mpn ?? '',
    country_of_origin: product?.country_of_origin ?? '',
    quantity: product?.quantity ?? 1,
    shipping_domestic: (product?.shipping_domestic as ShippingInfo) ?? { method: 'Standard Shipping', price: undefined },
    shipping_international: (product?.shipping_international as ShippingInfo) ?? { method: 'Standard International Shipping', price: undefined },
  })
  const [saving, setSaving] = useState(false)
  const [productId] = useState(product?.id ?? crypto.randomUUID())

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        shipping_domestic: form.shipping_domestic.method ? form.shipping_domestic : null,
        shipping_international: form.shipping_international.method ? form.shipping_international : null,
      }

      if (isEdit) {
        const res = await fetch(`/api/products/${product.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
        toast.success('המוצר עודכן בהצלחה')
        router.refresh()
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, id: productId }),
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

  const sectionTitle = (text: string) => (
    <h3 className="text-xs font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest pt-2 pb-1 border-b border-gray-100 dark:border-white/[0.06]">
      {text}
    </h3>
  )

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-5">

        {/* eBay Item Number (read-only) */}
        {product?.ebay_item_number && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
            <span className="text-xs text-orange-500 font-medium">eBay Item #</span>
            <span className="text-sm font-mono text-gray-700 dark:text-white/80">{product.ebay_item_number}</span>
            {product.ebay_url && (
              <a href={product.ebay_url} target="_blank" rel="noopener noreferrer"
                className="mr-auto text-xs text-orange-500 hover:underline">
                צפה ב-eBay ↗
              </a>
            )}
          </div>
        )}

        {/* כותרת eBay */}
        {sectionTitle('כותרת eBay')}
        <div>
          <label className="label-base">כותרת מוצר (eBay Item Title)</label>
          <input className="input-base" value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="Siemens S7-300 PLC CPU 315-2 DP 6ES7315-2AF03-0AB0" />
          <p className="text-xs text-gray-400 dark:text-white/30 mt-1">כותרת המוצר כפי שתופיע ב-eBay</p>
        </div>

        {/* פרטי מוצר בסיסיים */}
        {sectionTitle('פרטי מוצר')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">יצרן</label>
            <input className="input-base" value={form.manufacturer}
              onChange={(e) => update('manufacturer', e.target.value)}
              placeholder="Siemens, Fanuc, ABB..." />
          </div>
          <div>
            <label className="label-base">דגם</label>
            <input className="input-base" value={form.model}
              onChange={(e) => update('model', e.target.value)}
              placeholder="S7-300, 0i-MF..." />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">קטגוריה</label>
            <select className="input-base" value={form.category}
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

        {/* פרטי eBay */}
        {sectionTitle('הגדרות eBay')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">מק״ט / Custom Label (SKU)</label>
            <input className="input-base" value={form.sku}
              onChange={(e) => update('sku', e.target.value)}
              placeholder="SKU-12345" />
          </div>
          <div>
            <label className="label-base">קטגוריית eBay</label>
            <input className="input-base" value={form.ebay_category}
              onChange={(e) => update('ebay_category', e.target.value)}
              placeholder="58277" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">מותג (Brand)</label>
            <input className="input-base" value={form.brand}
              onChange={(e) => update('brand', e.target.value)}
              placeholder="Siemens" />
          </div>
          <div>
            <label className="label-base">MPN (Manufacturer Part Number)</label>
            <input className="input-base" value={form.mpn}
              onChange={(e) => update('mpn', e.target.value)}
              placeholder="6ES7315-2AF03-0AB0" />
          </div>
        </div>

        <div>
          <label className="label-base">מדינת ייצור (Country of Origin)</label>
          <select className="input-base" value={form.country_of_origin}
            onChange={(e) => update('country_of_origin', e.target.value)}>
            <option value="">בחר מדינה</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* מצב */}
        <div>
          <label className="label-base">מצב המוצר (Condition)</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {EBAY_CONDITIONS.map((c) => (
              <button key={c.value} type="button" onClick={() => update('condition', c.value)}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-medium border transition-all duration-150
                  ${form.condition === c.value
                    ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-transparent border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60 hover:border-orange-400 dark:hover:border-orange-500/50'
                  }`}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-1">
            {form.condition && EBAY_CONDITIONS.find(c => c.value === form.condition)
              ? `eBay: ${form.condition}`
              : form.condition}
          </p>
        </div>

        {/* מחיר, כמות, מיקום */}
        {sectionTitle('מחיר ומשלוח')}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label-base">מחיר (₪)</label>
            <input type="number" className="input-base" value={form.price ?? ''}
              onChange={(e) => update('price', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="5,000" />
          </div>
          <div>
            <label className="label-base">כמות (Quantity)</label>
            <input type="number" className="input-base" value={form.quantity ?? ''}
              onChange={(e) => update('quantity', e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="1" min={1} />
          </div>
          <div>
            <label className="label-base">מיקום</label>
            <input className="input-base" value={form.location}
              onChange={(e) => update('location', e.target.value)} placeholder="תל אביב" />
          </div>
        </div>

        {/* משלוח מקומי */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">משלוח מקומי — שיטה</label>
            <select className="input-base" value={form.shipping_domestic.method}
              onChange={(e) => update('shipping_domestic', { ...form.shipping_domestic, method: e.target.value })}>
              {SHIPPING_METHODS_DOM.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label-base">משלוח מקומי — מחיר ($)</label>
            <input type="number" className="input-base"
              value={form.shipping_domestic.price ?? ''}
              onChange={(e) => update('shipping_domestic', {
                ...form.shipping_domestic,
                price: e.target.value ? parseFloat(e.target.value) : undefined,
              })}
              placeholder="0 = חינם" min={0} step={0.01} />
          </div>
        </div>

        {/* משלוח בינלאומי */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-base">משלוח בינלאומי — שיטה</label>
            <select className="input-base" value={form.shipping_international.method}
              onChange={(e) => update('shipping_international', { ...form.shipping_international, method: e.target.value })}>
              {SHIPPING_METHODS_INT.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label-base">משלוח בינלאומי — מחיר ($)</label>
            <input type="number" className="input-base"
              value={form.shipping_international.price ?? ''}
              onChange={(e) => update('shipping_international', {
                ...form.shipping_international,
                price: e.target.value ? parseFloat(e.target.value) : undefined,
              })}
              placeholder="25" min={0} step={0.01} />
          </div>
        </div>

        {/* טלפון */}
        {sectionTitle('פרסום פייסבוק')}
        <div>
          <label className="label-base">טלפון</label>
          <input className="input-base" value={form.phone}
            onChange={(e) => update('phone', e.target.value)} placeholder="054-2333651" />
        </div>

        {/* תיאור */}
        <div>
          <label className="label-base">תיאור ומפרט טכני</label>
          <RichTextEditor
            value={form.description}
            onChange={(val) => update('description', val)}
          />
        </div>

        {/* הערות פנימיות */}
        <div>
          <label className="label-base">הערות פנימיות</label>
          <input className="input-base" value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="הערות לשימוש פנימי בלבד" />
        </div>

        {/* תמונות */}
        {sectionTitle('תמונות')}
        <div>
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
            manufacturer={form.manufacturer || form.brand || form.title.split(' ')[0]}
            model={form.model || form.title.split(' ').slice(1).join(' ')}
            category={form.category}
            condition={form.condition}
            year={form.year}
            location={form.location}
            price={form.price}
            description={form.description}
            phone={form.phone}
          />
        </div>
      </div>
    </form>
  )
}
