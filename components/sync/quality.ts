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

/** תמונה ממוזערת של eBay (140px) במקום הקובץ המלא — לפי מזהה התמונה שבכתובת */
export function ebayThumb(url: string): string {
  const id = url.match(/\/z\/([^/]+)\//)?.[1] ?? url.match(/\/images\/g\/([^/]+)\//)?.[1]
  return id ? `https://i.ebayimg.com/images/g/${id}/s-l140.jpg` : url
}
