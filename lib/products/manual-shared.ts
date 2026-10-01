// מוצר ידני — הטופס והשרת חולקים את הצורה ואת הבדיקות. בלי ייבוא צד-שרת (נטען גם בדפדפן).

export type ShipMode = 'flat' | 'free' | 'none'

/** צד אחד (ארה"ב / שאר העולם): משלוח רגיל (Standard) חובה, ואקספרס אופציונלי */
export interface ShipInput {
  /** Standard: מחיר קבוע / חינם / לא שולחים לצד הזה */
  mode: ShipMode
  /** מחיר לפריט הראשון (flat בלבד) */
  cost: string
  /** תוספת לכל פריט נוסף באותה הזמנה (flat בלבד, ריק = בלי תוספת) */
  additional: string
  /** אקספרס בנוסף ל-Standard (רק כשהצד לא 'none') */
  express: boolean
  expressCost: string
  expressAdditional: string
}

/**
 * שמות השירותים שנשמרים ב-_sync_shipping. ה-theme של החנות ממיין שירות ל-Standard או Express
 * לפי השם (industrial-parts-store/theme/store-theme/inc/shipping.php → vz_ship_service_key),
 * ושירות בלי שם לא מוצע בכלל. שמות ה-Standard לא מכילים express/expedited/priority/fedex/dhl/ups.
 */
export const SHIP_SERVICE = {
  us: { standard: 'ManualStandard', express: 'ManualExpress' },
  intl: { standard: 'ManualStandardInternational', express: 'ManualExpressInternational' },
} as const

export interface ManualProductInput {
  title: string
  shortDescription: string
  /** HTML מעורך הטקסט */
  description: string
  sku: string
  price: string
  salePrice: string
  /** YYYY-MM-DD או ריק */
  saleFrom: string
  saleTo: string
  quantity: number
  /** מותגים — הראשון הוא המותג הראשי (ה-theme מציג אותו ובסכמה) */
  brands: string[]
  mpn: string
  conditionId: string
  conditionNotes: string
  categorySlugs: string[]
  tags: string[]
  /** מפרט — שדות קבועים בלבד, באותם שמות כמו במוצרי eBay (מאפיינים בחנות) */
  specs: SpecsInput
  /** מזהי media_files לפי הסדר — הראשון הוא התמונה הראשית */
  imageIds: string[]
  /** exclude: מדינות (קוד בן 2 אותיות) או אזורים של eBay שלא שולחים אליהם */
  shipping: { us: ShipInput; intl: ShipInput; exclude: string[] }
  dims: { weight: string; length: string; width: string; height: string }
  /** שאלות ותשובות של המוצר — מוצגות בעמוד המוצר במקום השאלות הכלליות (_vz_faq) */
  faq: { q: string; a: string }[]
  /** טקסט חלופי לכל תמונה, לפי מזהה התמונה. ריק = "שם המוצר — photo N of M" */
  imageAlts: Record<string, string>
  /** slug של הקטגוריה הראשית (פירורי לחם). ריק = הראשונה שאינה קטגוריית-אב */
  primaryCategory: string
}

export const MAX_FAQ = 15

export interface SpecsInput {
  model: string
  /** שם המדינה באנגלית, כמו ב-eBay ("Germany") */
  countryOfOrigin: string
  type: string
  /** YYYY-MM בטופס; בחנות "Dec 2022" כמו במוצרי eBay */
  expirationDate: string
}

/** שם המאפיין בחנות לכל שדה מפרט — זהה ל-Item Specifics של eBay */
export const SPEC_NAMES = { model: 'Model', countryOfOrigin: 'Country of Origin', type: 'Type', expirationDate: 'Expiration Date' } as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2022-12" → "Dec 2022" */
export const expirationLabel = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}` : '')
/** "Dec 2022" → "2022-12" */
export const expirationInput = (label: string) => {
  const m = label.match(/^([A-Za-z]{3})\w* (\d{4})$/)
  const i = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1
  return i >= 0 ? `${m![2]}-${String(i + 1).padStart(2, '0')}` : ''
}

/** ISO 3166-1 — השמות באנגלית מ-Intl (כמו ב-eBay: Germany, United States, Japan) */
export const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GI GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VA VC VE VG VN VU WS YE ZA ZM ZW'.split(' ')
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
/** שמות שבהם Intl שונה מהשם המקובל במודעות */
const COUNTRY_OVERRIDES: Record<string, string> = {
  HK: 'Hong Kong',
  MO: 'Macau',
  CZ: 'Czech Republic',
  TR: 'Turkey',
  PS: 'Palestine',
  CD: 'Congo (DRC)',
  CG: 'Congo',
  CI: "Cote d'Ivoire",
}
export const countryName = (code: string) => COUNTRY_OVERRIDES[code] ?? regionNames?.of(code) ?? code

/** אזורים שה-theme מזהה ב-excludeLocations (vz_ship_location_matches), חוץ מקוד מדינה בן 2 אותיות */
export const SHIP_REGIONS = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America', 'Central America and Caribbean']
export const isShipLocation = (v: string) => /^[A-Z]{2}$/.test(v) || SHIP_REGIONS.includes(v)

export const CONDITIONS: [string, string][] = [
  ['1000', 'New'],
  ['1500', 'New – Open Box'],
  ['2000', 'Certified Refurbished'],
  ['2500', 'Seller Refurbished'],
  ['3000', 'Used'],
  ['7000', 'For Parts / Not Working'],
]

export const MAX_IMAGES = 12
/** גודל מקסימלי לקובץ אחרי הדחיסה בדפדפן */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024


export const emptyShip = (): ShipInput => ({ mode: 'flat', cost: '', additional: '', express: false, expressCost: '', expressAdditional: '' })

export const emptyManualProduct = (): ManualProductInput => ({
  title: '',
  shortDescription: '',
  description: '',
  sku: '',
  price: '',
  salePrice: '',
  saleFrom: '',
  saleTo: '',
  quantity: 1,
  brands: [],
  mpn: '',
  conditionId: '',
  conditionNotes: '',
  categorySlugs: [],
  tags: [],
  specs: { model: '', countryOfOrigin: '', type: '', expirationDate: '' },
  imageIds: [],
  shipping: { us: emptyShip(), intl: emptyShip(), exclude: [] },
  dims: { weight: '', length: '', width: '', height: '' },
  faq: [],
  imageAlts: {},
  primaryCategory: '',
})

const MONEY = /^\d{1,9}(\.\d{1,2})?$/
const DIM = /^\d{1,6}(\.\d{1,3})?$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
export const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/

export type FieldErrors = Partial<Record<string, string>>

/** בדיקת הטופס. אותה בדיקה בדפדפן (לפני שליחה) ובשרת (לפני שמירה). */
export function validateManualProduct(p: ManualProductInput): FieldErrors {
  const e: FieldErrors = {}
  if (!p.title.trim()) e.title = 'חובה לתת שם למוצר'
  else if (p.title.length > 200) e.title = 'עד 200 תווים'
  if (!SKU_RE.test(p.sku.trim())) e.sku = 'אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון — עד 64 תווים'
  if (p.price && !MONEY.test(p.price)) e.price = 'מספר עם עד 2 ספרות אחרי הנקודה'
  if (p.salePrice) {
    if (!MONEY.test(p.salePrice)) e.salePrice = 'מספר עם עד 2 ספרות אחרי הנקודה'
    else if (!p.price) e.salePrice = 'מחיר מבצע דורש מחיר רגיל'
    else if (Number(p.salePrice) >= Number(p.price)) e.salePrice = 'מחיר המבצע צריך להיות נמוך מהמחיר הרגיל'
  }
  if (p.saleFrom && !DAY.test(p.saleFrom)) e.saleFrom = 'תאריך לא תקין'
  if (p.saleTo && !DAY.test(p.saleTo)) e.saleTo = 'תאריך לא תקין'
  if (p.saleFrom && p.saleTo && p.saleTo < p.saleFrom) e.saleTo = 'תאריך הסיום לפני תאריך ההתחלה'
  if (!Number.isInteger(p.quantity) || p.quantity < 0 || p.quantity > 100000) e.quantity = 'מספר שלם, 0 ומעלה'
  for (const side of ['us', 'intl'] as const) {
    const s = p.shipping[side]
    if (s.mode === 'flat') {
      if (!MONEY.test(s.cost)) e[`ship_${side}_cost`] = 'חובה להזין מחיר משלוח (0 = חינם)'
      if (s.additional && !MONEY.test(s.additional)) e[`ship_${side}_additional`] = 'מספר עם עד 2 ספרות אחרי הנקודה'
    }
    if (s.mode !== 'none' && s.express) {
      if (!MONEY.test(s.expressCost)) e[`ship_${side}_expressCost`] = 'חובה להזין מחיר לאקספרס'
      if (s.expressAdditional && !MONEY.test(s.expressAdditional)) e[`ship_${side}_expressAdditional`] = 'מספר עם עד 2 ספרות אחרי הנקודה'
    }
  }
  for (const k of ['weight', 'length', 'width', 'height'] as const) if (p.dims[k] && !DIM.test(p.dims[k])) e[`dims_${k}`] = 'מספר בלבד'
  if (p.specs.countryOfOrigin && !COUNTRY_CODES.some((c) => countryName(c) === p.specs.countryOfOrigin)) e.spec_countryOfOrigin = 'בחר מדינה מהרשימה'
  if (p.specs.expirationDate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.specs.expirationDate)) e.spec_expirationDate = 'חודש ושנה'
  for (const k of ['model', 'type'] as const) if (p.specs[k].length > 120) e[`spec_${k}`] = 'עד 120 תווים'
  p.faq.forEach((f, i) => {
    if (!f.q.trim() && f.a.trim()) e[`faq_${i}`] = 'חסרה שאלה'
    else if (f.q.trim() && !f.a.trim()) e[`faq_${i}`] = 'חסרה תשובה'
  })
  if (p.faq.length > MAX_FAQ) e.faq = `עד ${MAX_FAQ} שאלות`
  if (p.primaryCategory && !p.categorySlugs.includes(p.primaryCategory)) e.primaryCategory = 'הקטגוריה הראשית חייבת להיות אחת מהקטגוריות שנבחרו'
  const badLoc = p.shipping.exclude.find((x) => !isShipLocation(x))
  if (badLoc) e.ship_exclude = `${badLoc} — קוד מדינה בן 2 אותיות (למשל RU) או אזור מהרשימה`
  if (p.brands.length > 5) e.brands = 'עד 5 מותגים'
  if (p.imageIds.length > MAX_IMAGES) e.images = `עד ${MAX_IMAGES} תמונות`
  if (p.shortDescription.length > 2000) e.shortDescription = 'עד 2,000 תווים'
  return e
}

/** מה חסר כדי לשלוח לחנות (שמירה במערכת אפשרית גם בלעדיהם) */
export function storeBlockers(p: Pick<ManualProductInput, 'price' | 'imageIds' | 'title'>): string[] {
  const out: string[] = []
  if (!p.title.trim()) out.push('שם המוצר')
  if (!p.price) out.push('מחיר')
  if (!p.imageIds.length) out.push('תמונה ראשית')
  return out
}

/** SKU מוצע למוצר חדש: MAN- + 6 תווים */
export function suggestSku(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)]
  return `MAN-${s}`
}
