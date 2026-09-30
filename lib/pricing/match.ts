// התאמה בין מוצר שלנו למודעה של מתחרה ב-eBay, וחישובי מחיר. פונקציות טהורות — בלי DB ובלי רשת.

/** ערכי MPN שאינם מספר חלק */
const MPN_PLACEHOLDERS = new Set(['', 'NA', 'N/A', 'NONE', 'DOESNOTAPPLY', 'DOES NOT APPLY', 'UNKNOWN', 'UNBRANDED', 'NOTAPPLICABLE', '-'])

/** אותיות וספרות בלבד, באותיות גדולות: "6ES7 214-1AG40/0XB0" → "6ES72141AG400XB0" */
export function compactPart(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** MPN שאפשר לחפש לפיו, או null (ריק / placeholder / קצר מדי — יותר מדי התאמות שגויות) */
export function usableMpn(mpn: string | null | undefined): string | null {
  if (!mpn) return null
  const trimmed = mpn.trim()
  if (MPN_PLACEHOLDERS.has(trimmed.toUpperCase()) || MPN_PLACEHOLDERS.has(compactPart(trimmed))) return null
  const c = compactPart(trimmed)
  if (c.length < 4) return null
  // מספר חלק אמיתי כמעט תמיד מכיל ספרה
  if (!/[0-9]/.test(c)) return null
  return trimmed
}

export type MatchLevel = 'exact' | 'likely' | 'weak'

export interface MatchResult {
  level: MatchLevel
  /** 0–100 */
  score: number
  reasons: string[]
}

/**
 * exact  — מספר החלק מופיע בכותרת כמילה שלמה (אחרי נרמול) + המותג מופיע (או שאין לנו מותג)
 * likely — מספר החלק מופיע בכותרת, המותג לא
 * weak   — מספר החלק לא מופיע בכותרת כמות שהוא (eBay מצא לפי שדות אחרים / חלק מהמספר / גרסה אחרת)
 */
export function matchListing(ours: { mpn: string; brand: string | null }, title: string): MatchResult {
  const reasons: string[] = []
  const mpnC = compactPart(ours.mpn)
  const titleC = compactPart(title)

  // התאמה כמילה: מפרקים את הכותרת לטוקנים ובודקים רצף טוקנים שמתחבר בדיוק ל-MPN.
  // כך "6ES7214-1AG40-0XB0" לא נחשב התאמה ל-"6ES7214-1AG40-0XB01" (גרסה אחרת).
  const tokens = title.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  let wordMatch = false
  for (let i = 0; i < tokens.length && !wordMatch; i++) {
    let acc = ''
    for (let j = i; j < tokens.length; j++) {
      acc += tokens[j]
      if (acc === mpnC) {
        wordMatch = true
        break
      }
      if (acc.length >= mpnC.length || !mpnC.startsWith(acc)) break
    }
  }

  const brandC = ours.brand ? compactPart(ours.brand) : ''
  // מותג: המילה הראשונה של המותג מספיקה ("ALLEN BRADLEY" ↔ "Allen-Bradley", "Rockwell Allen Bradley")
  const brandFirst = ours.brand ? compactPart(ours.brand.split(/[\s\-/]+/)[0] ?? '') : ''
  const brandHit = !brandC || (brandC.length >= 2 && (titleC.includes(brandC) || (brandFirst.length >= 3 && titleC.includes(brandFirst))))

  if (wordMatch) {
    reasons.push('מספר החלק בכותרת')
    if (brandHit) {
      if (brandC) reasons.push('המותג בכותרת')
      return { level: 'exact', score: 100, reasons }
    }
    reasons.push('המותג לא בכותרת')
    return { level: 'likely', score: 75, reasons }
  }
  if (titleC.includes(mpnC)) {
    reasons.push('מספר החלק בתוך מספר ארוך יותר (אולי גרסה אחרת)')
    return { level: 'weak', score: 40, reasons }
  }
  reasons.push('מספר החלק לא בכותרת')
  return { level: 'weak', score: brandHit && brandC ? 20 : 10, reasons }
}

export type ConditionGroup = 'new' | 'refurbished' | 'used' | 'parts' | 'unknown'

/** קבוצות מצב לפי conditionId של eBay — משווים רק בתוך אותה קבוצה */
export function conditionGroup(conditionId: string | number | null | undefined): ConditionGroup {
  const id = Number(conditionId)
  if (!Number.isFinite(id) || !conditionId) return 'unknown'
  if (id >= 1000 && id < 2000) return 'new' // 1000 New, 1500 New other, 1750 New with defects
  if (id >= 2000 && id < 3000) return 'refurbished' // 2000 Certified, 2010–2030, 2500 Seller refurbished
  if (id >= 3000 && id < 7000) return 'used' // 3000 Used, 4000–6000 Very good/Good/Acceptable
  if (id === 7000) return 'parts' // For parts or not working
  return 'unknown'
}

export const CONDITION_LABEL: Record<ConditionGroup, string> = {
  new: 'חדש',
  refurbished: 'מחודש',
  used: 'משומש',
  parts: 'לחלקים / לא עובד',
  unknown: 'לא ידוע',
}

/** מחיר כולל משלוח. null אם אין משלוח קבוע — אז משווים רק מחיר פריט. */
export function totalPrice(price: string | number | null, shipping: string | number | null): number | null {
  if (price == null) return null
  const p = Number(price)
  if (!Number.isFinite(p)) return null
  if (shipping == null) return null
  const s = Number(shipping)
  return Number.isFinite(s) ? round2(p + s) : null
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2)
}

export type Position = 'cheapest' | 'below_median' | 'at_median' | 'above_median' | 'most_expensive' | 'only_us' | 'no_price'

export interface PriceStats {
  count: number
  min: number | null
  median: number | null
  max: number | null
  /** % הפרש מהחציון: חיובי = אנחנו יקרים יותר */
  vsMedianPct: number | null
  /** % הפרש מהזול ביותר: חיובי = אנחנו יקרים יותר */
  vsMinPct: number | null
  position: Position
  /** כמה מתחרים זולים מאיתנו */
  cheaperCount: number
}

/** השוואת המחיר שלנו מול רשימת מחירים של מתחרים (אותה קבוצת מצב, אותו בסיס — פריט או כולל משלוח) */
export function priceStats(ours: number | null, competitors: number[]): PriceStats {
  const vals = competitors.filter((v) => Number.isFinite(v) && v > 0)
  const min = vals.length ? Math.min(...vals) : null
  const max = vals.length ? Math.max(...vals) : null
  const med = median(vals)
  const base = { count: vals.length, min, median: med, max }
  if (ours == null || !Number.isFinite(ours) || ours <= 0) {
    return { ...base, vsMedianPct: null, vsMinPct: null, position: 'no_price', cheaperCount: 0 }
  }
  if (!vals.length) return { ...base, vsMedianPct: null, vsMinPct: null, position: 'only_us', cheaperCount: 0 }

  const pct = (ref: number) => round2(((ours - ref) / ref) * 100)
  const vsMedianPct = pct(med!)
  let position: Position
  if (ours <= min!) position = 'cheapest'
  else if (ours > max!) position = 'most_expensive'
  else if (Math.abs(vsMedianPct) <= 5) position = 'at_median'
  else position = vsMedianPct < 0 ? 'below_median' : 'above_median'

  return { ...base, vsMedianPct, vsMinPct: pct(min!), position, cheaperCount: vals.filter((v) => v < ours).length }
}

export const POSITION_LABEL: Record<Position, string> = {
  cheapest: 'הזולים ביותר',
  below_median: 'מתחת לחציון',
  at_median: 'בגובה השוק (±5%)',
  above_median: 'מעל החציון',
  most_expensive: 'היקרים ביותר',
  only_us: 'אין מתחרים באותו מצב',
  no_price: 'אין לנו מחיר',
}
