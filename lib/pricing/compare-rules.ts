import { compactPart, conditionGroup, type ConditionGroup } from './match'

// השוואה מעמיקה לפי כללים: מה שונה בין המודעה שלנו למודעת מתחרה, והאם ההבדל מסביר מחיר נמוך / גבוה אצלם.
// פונקציות טהורות — בלי DB ובלי רשת. הכללים קוראים רק כותרת, כותרת משנה, הערות מצב ומפרט —
// לא את התיאור (תבניות של מוכרים יוצרות שם התאמות שגויות). את התיאור קורא Gemini.

/** צד אחד בהשוואה — שלנו או שלהם, באותו מבנה */
export interface ListingSide {
  title: string
  subtitle?: string | null
  condition: string | null
  conditionId: string | null
  conditionDescription: string | null
  specifics: Record<string, string>
  mpn: string | null
  description?: string | null
  price: number | null
  shipping: number | null
  returnsAccepted: boolean | null
  returnDays: number | null
  /** יחידות זמינות במודעה */
  available: number | null
  lotSize: number | null
  country: string | null
  seller?: string | null
  sellerFeedbackScore?: number | null
  topRated?: boolean
  listedAt: string | null
}

/** lower = מסביר למה אצלם זול יותר · higher = מסביר למה אצלם יקר יותר · neutral = שונה, בלי כיוון ברור */
export type DiffEffect = 'lower' | 'higher' | 'neutral'

export interface ListingDiff {
  key: string
  label: string
  ours: string
  theirs: string
  effect: DiffEffect
}

type Flag = 'parts' | 'untested' | 'tested' | 'sealed' | 'openBox' | 'refurbished' | 'warranty' | 'calibrated' | 'missing' | 'damage'

const FLAG_RULES: { flag: Flag; label: string; re: RegExp; /** כשרק אצלם — מסביר מחיר נמוך (lower) או גבוה (higher) */ theirsOnly: DiffEffect }[] = [
  { flag: 'parts', label: 'לחלקים / לא עובד', re: /\bfor parts\b|\bnot working\b|\bas[- ]is\b|\bbroken\b|\bfaulty\b|\bdefective\b|\bfor repair\b/i, theirsOnly: 'lower' },
  { flag: 'untested', label: 'לא נבדק', re: /\buntested\b|\bnot tested\b|\bunable to test\b|\bcan(?:'|no)?t test\b|\bno way to test\b/i, theirsOnly: 'lower' },
  { flag: 'tested', label: 'נבדק / עובד', re: /(?<!\bnot |\bun)\btested\b|\bfully functional\b|\btested working\b|\bworking condition\b|\bpulled from (?:a )?working\b/i, theirsOnly: 'higher' },
  { flag: 'sealed', label: 'חדש באריזה סגורה', re: /\bfactory sealed\b|\bsealed\b|\bnew in box\b|\bNIB\b|\bNIOB\b|\bNEW in (?:original )?box\b/i, theirsOnly: 'higher' },
  { flag: 'openBox', label: 'אריזה פתוחה / בלי אריזה', re: /\bopen(?:ed)? box\b|\bno box\b|\bwithout box\b|\bno original box\b/i, theirsOnly: 'lower' },
  { flag: 'refurbished', label: 'מחודש / שופץ', re: /\brefurb(?:ished)?\b|\breconditioned\b|\brebuilt\b|\bremanufactured\b|\boverhauled\b/i, theirsOnly: 'higher' },
  { flag: 'warranty', label: 'אחריות', re: /\b\d+[- ]?(?:day|month|year|yr)s?\b[- ]warranty\b|\bwarranty\b/i, theirsOnly: 'higher' },
  { flag: 'calibrated', label: 'מכויל', re: /\bcalibrated\b|\bcalibration cert/i, theirsOnly: 'higher' },
  { flag: 'missing', label: 'חסרים חלקים / יחידה בלבד', re: /\bmissing\b|\bno cables?\b|\bunit only\b|\bno accessories\b|\bno power (?:supply|cord)\b|\bincomplete\b/i, theirsOnly: 'lower' },
  { flag: 'damage', label: 'פגם / נזק', re: /\bcracked?\b|\bdent(?:ed)?\b|\bdamaged?\b|\bbent\b|\bheavy wear\b/i, theirsOnly: 'lower' },
]

/** הטקסט שהכללים קוראים (בלי התיאור) */
function ruleText(s: ListingSide): string {
  return [s.title, s.subtitle, s.conditionDescription].filter(Boolean).join('\n')
}

export function textFlags(text: string): Set<Flag> {
  const out = new Set<Flag>()
  for (const r of FLAG_RULES) if (r.re.test(text)) out.add(r.flag)
  // "untested" גובר על "tested"
  if (out.has('untested')) out.delete('tested')
  return out
}

/** כמה יחידות במודעה לפי lotSize או הכותרת ("Lot of 3", "(2 pcs)", "x4", "pair") */
export function lotUnits(s: Pick<ListingSide, 'title' | 'lotSize'>): number {
  if (s.lotSize && s.lotSize > 1) return s.lotSize
  const t = s.title
  const m =
    /\blot of (\d{1,3})\b/i.exec(t) ??
    /\b(\d{1,3})\s*(?:pcs|pieces|units)\b/i.exec(t) ??
    /\((\d{1,3})\s*x?\)/i.exec(t) ??
    /\bqty[:\s]*(\d{1,3})\b/i.exec(t) ??
    /(?:^|\s)x\s?(\d{1,2})\b/i.exec(t) ??
    /\b(\d{1,2})\s?x\s/i.exec(t)
  if (m && Number(m[1]) > 1) return Number(m[1])
  if (/\bpair\b/i.test(t)) return 2
  return 1
}

const VERSION_KEY = /^(?:rev(?:ision)?|version|firmware(?: version)?|fw|hardware version|series|software version)$/i

/** גרסה / Rev / קושחה — מהמפרט, אחרת מהכותרת */
export function versionOf(s: Pick<ListingSide, 'title' | 'specifics'>): string | null {
  for (const [k, v] of Object.entries(s.specifics)) if (VERSION_KEY.test(k.trim()) && v.trim()) return v.trim()
  const m = /\brev(?:ision)?\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9.]{0,5})\b/i.exec(s.title) ?? /\b(?:ver(?:sion)?|v)\.?\s*(\d+(?:\.\d+){0,3})\b/i.exec(s.title) ?? /\bFW\s*([0-9][0-9.]*)\b/i.exec(s.title)
  return m ? m[1].toUpperCase() : null
}

const GROUP_RANK: Record<ConditionGroup, number> = { new: 4, refurbished: 3, used: 2, parts: 1, unknown: 0 }

/** מפתחות מפרט שכבר מטופלים בנפרד או שלא אומרים כלום על המוצר */
const SKIP_SPECIFIC = /^(?:brand|mpn|manufacturer part number|condition|model|type|rev(?:ision)?|version|firmware.*|fw|series|country(?:\/region)? of (?:manufacture|origin)|upc|ean|isbn|custom bundle|modified item|non-domestic product|california prop 65 warning|unit (?:quantity|type)|item (?:height|length|width|weight)|number of items in set)$/i

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()

const yes = (b: boolean) => (b ? 'כן' : 'לא')
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86_400_000) : null
}

function age(days: number | null): string {
  if (days == null) return 'לא ידוע'
  if (days < 60) return `${days} ימים`
  if (days < 730) return `${Math.round(days / 30)} חודשים`
  return `${(days / 365).toFixed(1)} שנים`
}

function returns(s: ListingSide): string {
  if (s.returnsAccepted == null) return 'לא צוין'
  if (!s.returnsAccepted) return 'בלי החזרות'
  return s.returnDays ? `${s.returnDays} ימים` : 'מתקבלות'
}

/** ההבדלים בין המודעות, מהמשמעותי לפחות */
export function compareListings(ours: ListingSide, theirs: ListingSide, now = new Date()): ListingDiff[] {
  const diffs: ListingDiff[] = []

  // מצב
  const og = conditionGroup(ours.conditionId)
  const tg = conditionGroup(theirs.conditionId)
  if ((ours.condition ?? '') !== (theirs.condition ?? '') && (ours.condition || theirs.condition)) {
    const effect: DiffEffect = GROUP_RANK[tg] && GROUP_RANK[og] && tg !== og ? (GROUP_RANK[tg] < GROUP_RANK[og] ? 'lower' : 'higher') : 'neutral'
    diffs.push({ key: 'condition', label: 'מצב', ours: ours.condition ?? 'לא צוין', theirs: theirs.condition ?? 'לא צוין', effect })
  }

  // סימנים בכותרת ובהערות המצב
  const of = textFlags(ruleText(ours))
  const tf = textFlags(ruleText(theirs))
  for (const r of FLAG_RULES) {
    const a = of.has(r.flag)
    const b = tf.has(r.flag)
    if (a === b) continue
    const effect: DiffEffect = b ? r.theirsOnly : r.theirsOnly === 'lower' ? 'higher' : 'lower'
    diffs.push({ key: `flag:${r.flag}`, label: r.label, ours: yes(a), theirs: yes(b), effect })
  }

  // חבילה / כמה יחידות במחיר
  const ou = lotUnits(ours)
  const tu = lotUnits(theirs)
  if (ou !== tu) {
    const per = theirs.price != null && tu > 1 ? ` (${money(theirs.price / tu)} ליחידה)` : ''
    diffs.push({ key: 'lot', label: 'יחידות במחיר', ours: String(ou), theirs: `${tu}${per}`, effect: tu > ou ? 'higher' : 'lower' })
  }

  // גרסה / Rev
  const ov = versionOf(ours)
  const tv = versionOf(theirs)
  if (ov && tv && norm(ov) !== norm(tv)) diffs.push({ key: 'version', label: 'גרסה / Rev', ours: ov, theirs: tv, effect: 'neutral' })

  // מספר חלק במפרט
  if (ours.mpn && theirs.mpn && compactPart(ours.mpn) !== compactPart(theirs.mpn)) {
    diffs.push({ key: 'mpn', label: 'מספר חלק במפרט', ours: ours.mpn, theirs: theirs.mpn, effect: 'neutral' })
  }

  // החזרות
  const or = returns(ours)
  const tr = returns(theirs)
  if (or !== tr && ours.returnsAccepted != null && theirs.returnsAccepted != null) {
    const effect: DiffEffect =
      ours.returnsAccepted !== theirs.returnsAccepted ? (theirs.returnsAccepted ? 'higher' : 'lower') : (theirs.returnDays ?? 0) > (ours.returnDays ?? 0) ? 'higher' : 'lower'
    diffs.push({ key: 'returns', label: 'החזרות', ours: or, theirs: tr, effect })
  }

  // משלוח (מחיר הפריט נמוך אצלם אבל המשלוח יקר — או להפך)
  if (ours.shipping != null && theirs.shipping != null && Math.abs(ours.shipping - theirs.shipping) >= 10) {
    diffs.push({ key: 'shipping', label: 'משלוח לקונה', ours: money(ours.shipping), theirs: money(theirs.shipping), effect: theirs.shipping > ours.shipping ? 'lower' : 'higher' })
  }

  // מיקום
  if (ours.country && theirs.country && ours.country !== theirs.country) {
    diffs.push({ key: 'country', label: 'שולח מ', ours: ours.country, theirs: theirs.country, effect: 'neutral' })
  }

  // כמות זמינה — סוחר עם מלאי גדול מתמחר אחרת מיחידה בודדת
  if (theirs.available != null && theirs.available >= 5 && (ours.available ?? 1) < 5) {
    diffs.push({ key: 'available', label: 'יחידות זמינות', ours: ours.available != null ? String(ours.available) : 'לא ידוע', theirs: String(theirs.available), effect: 'lower' })
  }

  // מוכר
  if (theirs.topRated) diffs.push({ key: 'topRated', label: 'Top Rated', ours: 'לא ידוע', theirs: 'כן', effect: 'higher' })
  if (theirs.sellerFeedbackScore != null && theirs.sellerFeedbackScore < 50) {
    diffs.push({ key: 'feedback', label: 'פידבקים של המוכר', ours: '—', theirs: String(theirs.sellerFeedbackScore), effect: 'lower' })
  }

  // ותק המודעה — מודעה יקרה שעומדת שנה בלי להימכר היא לא "מחיר שוק"
  const oa = daysSince(ours.listedAt, now)
  const ta = daysSince(theirs.listedAt, now)
  if ((oa != null && oa > 180) || (ta != null && ta > 180)) {
    diffs.push({ key: 'age', label: 'המודעה באוויר', ours: age(oa), theirs: age(ta), effect: 'neutral' })
  }

  // מפרט: שדות משותפים עם ערך שונה
  const oursSpec = new Map(Object.entries(ours.specifics).map(([k, v]) => [k.trim().toLowerCase(), { k, v }]))
  let specs = 0
  for (const [k, v] of Object.entries(theirs.specifics)) {
    if (specs >= 6 || SKIP_SPECIFIC.test(k.trim())) continue
    const o = oursSpec.get(k.trim().toLowerCase())
    if (!o || !o.v.trim() || !v.trim() || norm(o.v) === norm(v)) continue
    diffs.push({ key: `spec:${k}`, label: k, ours: o.v, theirs: v, effect: 'neutral' })
    specs++
  }

  const order: Record<DiffEffect, number> = { lower: 0, higher: 0, neutral: 1 }
  return diffs.map((d, i) => ({ d, i })).sort((a, b) => order[a.d.effect] - order[b.d.effect] || a.i - b.i).map((x) => x.d)
}

/** פער מחיר הפריט באחוזים: (שלהם − שלנו) / שלנו */
export function gapPct(ours: number | null, theirs: number | null): number | null {
  if (ours == null || theirs == null || ours <= 0) return null
  return Math.round(((theirs - ours) / ours) * 10000) / 100
}
