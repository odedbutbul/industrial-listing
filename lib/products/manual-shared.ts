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
  brand: string
  mpn: string
  conditionId: string
  conditionNotes: string
  categorySlugs: string[]
  tags: string[]
  attributes: { name: string; values: string }[]
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

export const MEDIA_PATH = '/api/public/media'
export const MAX_IMAGES = 12
/** גודל מקסימלי לקובץ אחרי הדחיסה בדפדפן */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** כתובת התמונה במערכת: /api/public/media/<id>/<name> */
export const mediaUrl = (id: string, fileName: string) => `${MEDIA_PATH}/${id}/${encodeURIComponent(fileName)}`
export const mediaIdFromUrl = (url: string) => url.match(/\/api\/public\/media\/([0-9a-f-]{36})\//i)?.[1] ?? null

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
  brand: '',
  mpn: '',
  conditionId: '',
  conditionNotes: '',
  categorySlugs: [],
  tags: [],
  attributes: [],
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
  p.attributes.forEach((a, i) => {
    if (!a.name.trim() && a.values.trim()) e[`attr_${i}`] = 'חסר שם למאפיין'
    else if (a.name.trim() && !a.values.trim()) e[`attr_${i}`] = 'חסר ערך'
  })
  p.faq.forEach((f, i) => {
    if (!f.q.trim() && f.a.trim()) e[`faq_${i}`] = 'חסרה שאלה'
    else if (f.q.trim() && !f.a.trim()) e[`faq_${i}`] = 'חסרה תשובה'
  })
  if (p.faq.length > MAX_FAQ) e.faq = `עד ${MAX_FAQ} שאלות`
  if (p.primaryCategory && !p.categorySlugs.includes(p.primaryCategory)) e.primaryCategory = 'הקטגוריה הראשית חייבת להיות אחת מהקטגוריות שנבחרו'
  const badLoc = p.shipping.exclude.find((x) => !isShipLocation(x))
  if (badLoc) e.ship_exclude = `${badLoc} — קוד מדינה בן 2 אותיות (למשל RU) או אזור מהרשימה`
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
