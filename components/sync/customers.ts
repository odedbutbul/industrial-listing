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
