import type { Tone } from './ui'

/** שמות הבדיקות של בדיקת המודעות (lib/quality/checks.ts) — בסדר ההצגה */
export const CHECK_LABEL = {
  label_mismatch: 'תווית של מוצר אחר',
  title_content: 'כותרת לא תואמת לתוכן',
  shared_image: 'תמונות משותפות',
  desc_mismatch: 'תיאור של מוצר אחר',
  mpn_near_miss: 'דגם כמעט זהה',
  specifics_other: 'פרטי מוצר לא תואמים',
  brand_conflict: 'מותג סותר',
} as const

export const SEVERITY: Record<'high' | 'medium' | 'low', [string, Tone]> = {
  high: ['חמור', 'bad'],
  medium: ['לבדוק', 'warn'],
  low: ['כנראה כפילות', 'gray'],
}

/** שדות התוכן שמתעדכנים באתר אחרי שינוי ב-eBay (lib/sync/woo-content.ts) */
export const CONTENT_FIELD_LABEL = {
  name: 'שם',
  description: 'תיאור',
  image: 'תמונה ראשית',
  gallery: 'גלריה',
  attributes: 'מאפיינים',
  brands: 'מותג',
  categories: 'קטגוריות',
  mpn: 'MPN',
  condition_notes: 'הערות מצב',
  ebay_category: 'קטגוריית eBay',
} as const

type ContentField = keyof typeof CONTENT_FIELD_LABEL

/** תוצאת עדכון התוכן בחנות למוצר אחד (StoreContentResult ב-lib/sync/woo-content.ts) */
export interface StoreResult {
  status: 'updated' | 'same' | 'kept_edits' | 'missing' | 'failed'
  updated: ContentField[]
  keptStoreEdits: ContentField[]
  error?: string
}

/** מה קרה באתר — לסוף ההודעה. bad = משהו לא עודכן */
export function storeNote(store: StoreResult[]): { text: string; bad: boolean } {
  if (!store.length) return { text: '', bad: false }
  const labels = (fs: ContentField[]) => Array.from(new Set(fs)).map((f) => CONTENT_FIELD_LABEL[f]).join(', ')
  const parts: string[] = []
  const updated = store.flatMap((s) => (s.status === 'updated' ? s.updated : []))
  const kept = store.flatMap((s) => s.keptStoreEdits)
  const failed = store.filter((s) => s.status === 'failed' || s.status === 'missing')
  if (updated.length) parts.push(`עודכן גם באתר: ${labels(updated)}`)
  if (kept.length) parts.push(`באתר לא נדרס מה שנערך ידנית בחנות: ${labels(kept)}`)
  if (failed.length) parts.push(`העדכון באתר נכשל: ${failed[0].error ?? 'שגיאה'} — יתבצע שוב בבדיקה היומית`)
  return { text: parts.length ? ' · ' + parts.join(' · ') : '', bad: failed.length > 0 || kept.length > 0 }
}
