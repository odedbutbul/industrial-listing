import type { Tone } from './ui'

/** שמות הבדיקות של בדיקת המודעות (lib/quality/checks.ts) — בסדר ההצגה */
export const CHECK_LABEL = {
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
