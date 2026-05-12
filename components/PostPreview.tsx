'use client'

interface Props {
  manufacturer: string
  model: string
  category: string
  condition: string
  year?: number
  location?: string
  price?: number
  description?: string
  phone?: string
}

export default function PostPreview({ manufacturer, model, category, condition, year, location, price, description, phone }: Props) {
  if (!manufacturer && !model) {
    return (
      <div className="bg-[#1a1d24] border border-white/10 rounded-xl p-4 text-white/30 text-sm text-center">
        מלא את הפרטים לצפייה בתצוגה מקדימה
      </div>
    )
  }

  return (
    <div className="bg-[#1a1d24] border border-white/10 rounded-xl p-4 space-y-1 text-sm leading-relaxed">
      <p className="font-bold text-orange-400">🔧 {manufacturer} {model}{category ? ` | ${category}` : ''}</p>
      <p className="text-white/80 mt-2">📌 מצב: {condition}</p>
      <p className="text-white/80">📅 שנת ייצור: {year || 'לא צוין'}</p>
      <p className="text-white/80">📍 מיקום: {location || 'לא צוין'}</p>
      <p className="text-white/80">💰 מחיר: ₪{price || 'לא צוין'}</p>
      {description && (
        <>
          <p className="text-white/80 mt-2">📋 פרטים נוספים:</p>
          <p className="text-white/70 whitespace-pre-line">{description}</p>
        </>
      )}
      <p className="text-white/40 mt-2">─────────────────</p>
      <p className="text-white/70">י.פ. פתרונות טכניים</p>
      <p className="text-white/70">📞 {phone || '054-2333651'}</p>
      <p className="text-white/70">✉️ info@yp-ts.com</p>
    </div>
  )
}
