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
      <div className="card p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
            className="w-6 h-6 text-gray-300 dark:text-white/20">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </div>
        <p className="text-sm text-gray-400 dark:text-white/30">מלא את הפרטים לצפייה מקדימה</p>
      </div>
    )
  }

  return (
    <div className="card p-4 text-sm leading-relaxed space-y-1 animate-fade-in">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-white/10">
        <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center text-sm">🔧</div>
        <div>
          <p className="font-bold text-gray-900 dark:text-white text-sm">
            {manufacturer} {model}
            {category ? <span className="text-orange-500 font-normal"> | {category}</span> : ''}
          </p>
          <p className="text-xs text-gray-400 dark:text-white/40">תצוגה מקדימה לפייסבוק</p>
        </div>
      </div>

      <div className="space-y-1.5 text-gray-700 dark:text-white/70">
        <p>📌 מצב: <span className="text-gray-900 dark:text-white font-medium">{condition}</span></p>
        <p>📅 שנת ייצור: <span className="text-gray-900 dark:text-white font-medium">{year || 'לא צוין'}</span></p>
        <p>📍 מיקום: <span className="text-gray-900 dark:text-white font-medium">{location || 'לא צוין'}</span></p>
        <p>💰 מחיר: <span className="text-orange-500 font-bold">₪{price?.toLocaleString() || 'לא צוין'}</span></p>
        {description && (
          <div className="pt-1">
            <p className="text-gray-500 dark:text-white/40 text-xs">📋 פרטים נוספים:</p>
            <p className="text-gray-700 dark:text-white/70 whitespace-pre-line text-xs mt-0.5">{description}</p>
          </div>
        )}
      </div>

      <div className="pt-3 mt-2 border-t border-gray-100 dark:border-white/10 text-xs text-gray-500 dark:text-white/40 space-y-0.5">
        <p className="font-semibold text-gray-700 dark:text-white/60">י.פ. פתרונות טכניים</p>
        <p>📞 {phone || '054-2333651'}</p>
        <p>✉️ info@yp-ts.com</p>
      </div>
    </div>
  )
}
