import type { Tone } from './ui'

// פורמטים וטבלאות סטטוס למסכי /sync. טונים לפי shape-design (ax-*).

/** 25.9.2026 */
export function date(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
}

/** 25.9.2026 · 09:14 */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${date(iso)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "לפני 20 דקות", "אתמול, 18:40", ואז תאריך */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60_000))
  if (min < 1) return 'עכשיו'
  if (min === 1) return 'לפני דקה'
  if (min < 60) return `לפני ${min} דקות`
  const h = Math.round(min / 60)
  if (h === 1) return 'לפני שעה'
  if (h === 2) return 'לפני שעתיים'
  if (h < 24) return `לפני ${h} שעות`
  const d = new Date(t)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `אתמול, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.round(min / 1440)
  if (days < 7) return days === 2 ? 'לפני יומיים' : `לפני ${days} ימים`
  return date(iso)
}

const CURRENCY_SIGN: Record<string, string> = { USD: '$', ILS: '₪', EUR: '€', GBP: '£' }

/** $450 או $99.50, מבודד (U+2066…U+2069) כדי שלא יתהפך בתוך משפט עברי */
export function money(amount: string | number | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  const digits = n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}
  return `⁦${CURRENCY_SIGN[currency] ?? currency + ' '}${n.toLocaleString('en-US', digits)}⁩`
}

export const num = (n: number) => n.toLocaleString('en-US')

/** 12.4% / 0.8% — null → — */
export function pct(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const x = v * 100
  return `${x.toFixed(digits ?? (Math.abs(x) < 10 ? 1 : 0))}%`
}

/** 1m 24s */
export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—'
  const s = Math.round(sec)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** 12,400 → 12.4K (לגרפים) */
export const compact = (n: number) => (Math.abs(n) >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : num(Math.round(n)))

// ── טבלת סטטוסים אחת לכל המסכים ──────────────────────────────────────────────

export function stockStatus(available: number): [string, Tone] {
  return available > 0 ? ['במלאי', 'ok'] : ['אזל', 'gray']
}

export const WOO_NOT_LINKED: [string, Tone] = ['לא מקושר', 'gray']
export const MISMATCH: [string, Tone] = ['פער מול eBay', 'warn']
export const SYNC_OFF: [string, Tone] = ['סנכרון כבוי', 'gray']

export const LEDGER_REASON: Record<string, string> = {
  initial: 'מלאי פתיחה',
  sale: 'מכירה',
  cancel: 'ביטול הזמנה',
  refund: 'החזר',
  manual_adjust: 'תיקון ידני',
  reconcile_correction: 'תיקון מהתאמה',
}

export const LEDGER_SOURCE: Record<string, string> = {
  ebay: 'eBay',
  woo: 'האתר',
  manual: 'ידני',
  reconcile: 'התאמה',
  import: 'ייבוא',
}

export const JOB_LABEL: Record<string, string> = {
  'import-ebay': 'ייבוא מ-eBay',
  'enrich-ebay': 'פרטי מוצרים מ-eBay',
  'shipping-costs': 'מחירים ומשלוח מ-eBay',
  'ebay-auth': 'חיבור eBay',
  'poll-ebay-orders': 'הזמנות מ-eBay',
  woo_products: 'שליחה לחנות',
  woo_shipping: 'מחירים ומשלוח לחנות',
  woo_connection: 'חיבור WooCommerce',
  analytics: 'אנליטיקס (גוגל)',
  leads: 'לידים מהאתר',
}

export const ACTION_LABEL: Record<string, string> = {
  run: 'ריצה',
  import_item: 'ייבוא מוצר',
  get_item: 'קריאת מודעה',
  get_seller_list: 'קריאת מחירים ומשלוח',
  update_shipping: 'עדכון משלוח במוצר בחנות',
  update_price: 'עדכון מחיר במוצר בחנות',
  update_price_shipping: 'עדכון מחיר/משלוח במוצר בחנות',
  price_change: 'מחיר השתנה ב-eBay',
  qty_mismatch: 'פער כמות',
  skip_item: 'דילוג על מודעה',
  import_batch: 'שמירת מנה',
  connect: 'התחברות',
  refresh: 'חידוש Token',
  apply_order: 'קליטת הזמנה',
  oversold: 'מכירה מעבר למלאי',
  create_product: 'יצירת מוצר בחנות',
  link_product: 'קישור למוצר קיים בחנות',
  test: 'בדיקת חיבור',
  gsc_fetch: 'משיכה מ-Search Console',
  ga4_fetch: 'משיכה מ-Google Analytics',
  woo_catalog_fetch: 'תמונת מצב של מוצרי החנות',
  google_connection: 'בדיקת חיבור לגוגל',
  receive_lead: 'קליטת ליד',
  pull_leads: 'משיכה מהאתר',
  reject_lead: 'ליד נדחה (חתימה)',
  invalid_lead: 'ליד לא תקין',
}

export const SKIP_REASON: Record<string, string> = {
  variations_unsupported: 'מודעה עם וריאציות (לא נתמך עדיין)',
  duplicate_sku: 'SKU כפול',
  no_quantity: 'בלי כמות זמינה',
}

/** סטטוס ליד → תווית + טון */
export const LEAD_STATUS: Record<string, [string, Tone]> = {
  new: ['חדש', 'accent'],
  in_progress: ['בטיפול', 'blue'],
  quoted: ['נשלחה הצעה', 'violet'],
  won: ['נסגר · נמכר', 'ok'],
  lost: ['נסגר · לא נמכר', 'gray'],
}

export const LEAD_KIND: Record<string, string> = { rfq: 'בקשת חלק', msg: 'הודעה' }

/** 2.4 MB */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** מחיר משלוח של שירות אחד: חינם / סכום / מחושב לפי הקונה / — */
export function shipPrice(opt: { cost: string | null; free: boolean } | null | undefined, currency: string | null | undefined, globalShipping = false): string {
  if (!opt) return globalShipping ? 'eBay International' : '—'
  if (opt.free) return 'חינם'
  if (opt.cost === null) return 'מחושב לפי הקונה'
  return money(opt.cost, currency ?? 'USD')
}

/** האם shipPrice יחזיר סכום (גופן מספרים) ולא מילים */
export const shipIsMoney = (opt: { cost: string | null; free: boolean } | null | undefined) => !!opt && !opt.free && opt.cost !== null
