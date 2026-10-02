import type { Tone } from './ui'

// תוויות משותפות למסכי הלקוחות.

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['he'], { type: 'region' })
  } catch {
    return null
  }
})()

/** "US" → "ארצות הברית" */
export function countryName(code: string | null | undefined): string {
  if (!code) return 'לא ידוע'
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

export type MarketingState = 'eligible' | 'unsubscribed' | 'blocked_ebay' | 'no_consent' | 'anonymized'

export const MARKETING: Record<MarketingState, [string, Tone]> = {
  eligible: ['מאושר לדיוור', 'ok'],
  no_consent: ['בלי הסכמה', 'gray'],
  blocked_ebay: ['קונה eBay — לא לדיוור', 'gray'],
  unsubscribed: ['הוסר מדיוור', 'warn'],
  anonymized: ['הפרטים נמחקו', 'gray'],
}

export const CHANNEL_LABEL: Record<string, [string, Tone]> = { ebay: ['eBay', 'blue'], woo: ['האתר', 'violet'] }

export const ORDER_STATE_LABEL: Record<string, [string, Tone]> = {
  paid: ['שולמה', 'ok'],
  pending: ['ממתינה לתשלום', 'warn'],
  cancel_requested: ['בקשת ביטול', 'warn'],
  cancelled: ['בוטלה', 'gray'],
  refunded: ['הוחזר כסף', 'gray'],
}

// ── התנהלות לקוח ──

export const BEHAVIOR: Record<string, [string, Tone]> = {
  good: ['לקוח טוב', 'ok'],
  ok: ['תקין', 'gray'],
  watch: ['לשים לב', 'warn'],
  risk: ['בעייתי', 'bad'],
  new: ['לקוח חדש', 'gray'],
}

export const CASE_KIND: Record<string, [string, Tone]> = {
  cancellation: ['ביטול', 'gray'],
  refund: ['החזר כספי', 'blue'],
  return: ['בקשת החזרה', 'warn'],
  inquiry: ['לא קיבלתי', 'warn'],
  case: ['קייס ב-eBay', 'bad'],
}

export const INITIATOR: Record<string, string> = { buyer: 'הלקוח', seller: 'המוכרת', ebay: 'eBay' }

/** קודי סיבה של eBay → עברית. קוד לא מוכר מוצג כמו שהוא */
const REASONS: Record<string, string> = {
  NOT_AS_DESCRIBED: 'לא כמו בתיאור',
  DEFECTIVE_ITEM: 'פריט פגום',
  ARRIVED_DAMAGED: 'הגיע פגום',
  WRONG_ITEM: 'נשלח פריט אחר',
  MISSING_PARTS: 'חסרים חלקים',
  NOT_AUTHENTIC: 'לא מקורי',
  NO_LONGER_NEED_ITEM: 'כבר לא צריך',
  ORDERED_ACCIDENTALLY: 'הזמין בטעות',
  ORDERED_WRONG_ITEM: 'הזמין פריט לא נכון',
  FOUND_BETTER_PRICE: 'מצא מחיר טוב יותר',
  ORDERED_DIFFERENT_ITEM: 'הזמין פריט אחר',
  DOES_NOT_FIT: 'לא מתאים',
  CHANGED_MIND: 'התחרט',
  BUYER_CANCEL_OR_ADDRESS_ISSUE: 'הלקוח ביקש / בעיית כתובת',
  BUYER_ASKED_CANCEL: 'הלקוח ביקש לבטל',
  ADDRESS_ISSUES: 'בעיה בכתובת',
  OUT_OF_STOCK_OR_CANNOT_FULFILL: 'אזל במלאי',
  OUT_OF_STOCK: 'אזל במלאי',
  ITEM_NOT_RECEIVED: 'הפריט לא הגיע',
  INR: 'הפריט לא הגיע',
  SNAD: 'לא כמו בתיאור',
  RETURN: 'החזרה',
  ITEM_NOT_AS_DESCRIBED: 'לא כמו בתיאור',
  UNPAID_ITEM: 'לא שולם',
}

export function reasonLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return REASONS[code.toUpperCase()] ?? code.replace(/_/g, ' ').toLowerCase()
}
