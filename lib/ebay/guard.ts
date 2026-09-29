// שמירה על חשבון ה-eBay החי: כל קריאה ל-Trading API עוברת כאן.
// רק קריאות קריאה (allowlist) מותרות. כל קריאה אחרת — AddItem, ReviseItem, EndItem,
// ReviseInventoryStatus וכו' — נחסמת לפני שהיא נשלחת, אלא אם EBAY_WRITES_ENABLED=true.
// ההפעלה של כתיבה ל-eBay היא החלטה של עודד בלבד (ראה PROGRESS.md, החלטה ג׳).

export const EBAY_READ_ONLY_CALLS = new Set([
  'GetMyeBaySelling',
  'GetItem',
  'GetUser',
  'GeteBayDetails',
  'GetSellerList',
  'GetOrders',
  'VerifyAddItem', // בדיקת תקינות בלבד — לא יוצר מודעה
])

export class EbayWriteBlockedError extends Error {
  constructor(readonly callName: string) {
    super(`קריאת כתיבה ל-eBay (${callName}) חסומה — החשבון במצב קריאה בלבד (EBAY_WRITES_ENABLED כבוי)`)
  }
}

export function ebayWritesEnabled(): boolean {
  return process.env.EBAY_WRITES_ENABLED === 'true'
}

/** זורק EbayWriteBlockedError אם הקריאה אינה קריאה-בלבד והכתיבה כבויה. */
export function assertEbayCallAllowed(callName: string): void {
  if (EBAY_READ_ONLY_CALLS.has(callName)) return
  if (ebayWritesEnabled()) return
  throw new EbayWriteBlockedError(callName)
}
