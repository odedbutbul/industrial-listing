// בדיקת איכות מודעות — שכבה 1 (בלי AI): מוצאת מודעות שכנראה שוכפלו ממודעה אחרת ולא עודכנו.
// פונקציה טהורה: מקבלת את כל המוצרים ומחזירה ממצאים. בלי DB, בלי רשת, בלי שום שינוי ב-eBay.
//
// הבדיקות:
//  shared_image      אותה תמונה (מזהה התמונה של eBay) בשני מוצרים או יותר
//  title_content     הכותרת של מוצר אחד, והתיאור + הפרטים של מוצר אחר — הכותרת שונתה והשאר לא
//  desc_mismatch     התיאור לא מזכיר אף מספר דגם מהכותרת
//  specifics_other   המותג וגם הדגם בפרטי המוצר לא מופיעים בכותרת ולא בתיאור
//  mpn_near_miss     הדגם בפרטים כמעט זהה לדגם בכותרת (X20BB81 מול "X20 BB 80")
//  brand_conflict    הכותרת מזכירה מותג מוכר אחר, והמותג שבפרטים לא מופיע בה
//
// כותרת זהה בכמה מוצרים אינה ממצא: אצל vizvik16 כל יחידה פיזית היא מודעה נפרדת (SKU רץ, אותה כותרת).

import { containsBrand, dropRev, htmlToText, isMeaningful, modelTokens, nearMiss, splitParts, squash } from './text'

export type IssueCheck = 'shared_image' | 'title_content' | 'desc_mismatch' | 'specifics_other' | 'mpn_near_miss' | 'brand_conflict'
export type IssueSeverity = 'high' | 'medium' | 'low'

export interface QualityProduct {
  id: string
  title: string
  brand: string | null
  mpn: string | null
  description: string | null
  itemSpecifics: Record<string, string[]> | null
  images: string[]
  sku: string | null
}

export interface RelatedProduct {
  id: string
  title: string
  sku: string | null
}

export interface QualityIssue {
  productId: string
  check: IssueCheck
  severity: IssueSeverity
  /** מזהה יציב של הממצא — אותו ממצא בסריקה הבאה מקבל אותו מפתח (כדי ש"בסדר, דלג" יישמר) */
  key: string
  /** משפט אחד בעברית: מה הבעיה */
  message: string
  details: {
    related?: RelatedProduct[]
    /** מיקומי התמונות המשותפות במודעה הזו (1 = הראשונה, בדרך כלל תווית המחסן) */
    positions?: number[]
    imageUrls?: string[]
    expected?: string
    found?: string
    field?: string
    /** תחילת התיאור — כדי לראות במסך על איזה מוצר הוא מדבר */
    descStart?: string
  }
}

/** מזהה התמונה ב-eBay מתוך הכתובת: .../z/<id>/$_57.JPG או .../images/g/<id>/s-l140.jpg */
export function ebayImageId(url: string): string | null {
  return url.match(/\/z\/([^/]+)\//)?.[1] ?? url.match(/\/images\/g\/([^/]+)\//)?.[1] ?? null
}

function specific(p: QualityProduct, ...names: string[]): string | null {
  const s = p.itemSpecifics
  if (!s) return null
  for (const n of names) {
    const hit = Object.entries(s).find(([k]) => k.toLowerCase() === n.toLowerCase())
    const v = hit?.[1]?.find((x) => x?.trim())
    if (v) return v.trim()
  }
  return null
}

interface Prepared {
  p: QualityProduct
  titleSq: string
  descSq: string
  descStart: string
  brand: string | null
  mpn: string | null
  models: string[]
  imageIds: string[]
}

function prepare(p: QualityProduct): Prepared {
  const desc = htmlToText(p.description)
  const brand = specific(p, 'Brand') ?? p.brand
  const mpn = specific(p, 'MPN', 'Manufacturer Part Number') ?? p.mpn
  return {
    p,
    titleSq: squash(dropRev(p.title)),
    descSq: squash(dropRev(desc)),
    descStart: desc.slice(0, 160),
    brand: brand && isMeaningful(squash(brand)) ? brand : null,
    mpn: mpn && isMeaningful(squash(mpn)) && squash(mpn).length >= 4 ? mpn : null,
    models: modelTokens(p.title),
    imageIds: p.images.map(ebayImageId).filter((x): x is string => !!x),
  }
}

const rel = (x: Prepared): RelatedProduct => ({ id: x.p.id, title: x.p.title, sku: x.p.sku })

/** מותגים "מוכרים": מותג שמופיע בפרטים של 3+ מוצרים. מותג-מקור (כמו Lumenis — הציוד שממנו פורק החלק) לא נחשב סתירה. */
function knownBrands(all: Prepared[]): { name: string; sq: string }[] {
  const byBrand = new Map<string, { name: string; count: number; inTitle: number; inOtherTitles: number }>()
  for (const x of all) {
    if (!x.brand) continue
    const sq = squash(x.brand)
    if (sq.length < 3) continue
    const e = byBrand.get(sq) ?? { name: x.brand, count: 0, inTitle: 0, inOtherTitles: 0 }
    e.count++
    byBrand.set(sq, e)
  }
  const list = Array.from(byBrand.entries()).filter(([, e]) => e.count >= 3)
  // כמה פעמים המותג מופיע בכותרת של מוצר שהמותג שלו אחר
  for (const x of all) {
    const own = x.brand ? squash(x.brand) : ''
    for (const [sq, e] of list) if (sq !== own && x.titleSq.includes(sq)) e.inOtherTitles++
  }
  // אם המותג מופיע בכותרות של מוצרים ממותג אחר יותר מ-15% מהפעמים שהוא המותג עצמו — זה מותג-מקור, לא סתירה
  return list.filter(([, e]) => e.inOtherTitles <= Math.max(2, e.count * 0.15)).map(([sq, e]) => ({ name: e.name, sq }))
}

const titleWords = (t: string) => new Set(dropRev(t).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 2))

/**
 * אותו מוצר: חולקים מספר דגם, או — כשאין ביניהם מספרי דגם סותרים — הכותרות כמעט זהות (חצי מהמילים ומעלה משותפות).
 * "Meiden UF903/001A" מול "Meiden UF903/003A" — דגמים סותרים → לא אותו מוצר, גם שהכותרת כמעט זהה.
 */
function sameProduct(a: Prepared, b: Prepared): boolean {
  if (a.models.some((m) => b.models.includes(m))) return true
  if (a.models.length && b.models.length) return false
  const wa = titleWords(a.p.title)
  const wb = titleWords(b.p.title)
  const common = Array.from(wa).filter((w) => wb.has(w)).length
  return common / (wa.size + wb.size - common) >= 0.5
}

/** מילה שלמה בתוך כותרת (לא חלק ממילה אחרת): "ABB" לא נמצא בתוך "CABBAGE" */
function wordIn(title: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`, 'i').test(title)
}

export function runQualityChecks(products: QualityProduct[]): QualityIssue[] {
  const all = products.map(prepare)
  const issues: QualityIssue[] = []

  // ── תמונה משותפת ──
  const byImage = new Map<string, Prepared[]>()
  for (const x of all) for (const id of Array.from(new Set(x.imageIds))) byImage.set(id, [...(byImage.get(id) ?? []), x])
  const sharedWith = new Map<string, Map<string, Prepared>>() // product → other products
  for (const group of Array.from(byImage.values())) {
    if (group.length < 2) continue
    for (const a of group) {
      const m = sharedWith.get(a.p.id) ?? new Map<string, Prepared>()
      for (const b of group) if (b !== a) m.set(b.p.id, b)
      sharedWith.set(a.p.id, m)
    }
  }
  for (const x of all) {
    const others = sharedWith.get(x.p.id)
    if (!others) continue
    const otherList = Array.from(others.values())
    const otherIds = new Set(otherList.flatMap((o) => o.imageIds))
    const positions = x.imageIds.map((id, i) => (otherIds.has(id) ? i + 1 : 0)).filter(Boolean)
    // כל המוצרים האחרים הם אותו מוצר → כנראה מודעה כפולה; אחרת → תמונות של מוצר אחר
    const sameModel = otherList.every((o) => sameProduct(x, o))
    const label = positions.includes(1)
    issues.push({
      productId: x.p.id,
      check: 'shared_image',
      severity: sameModel ? 'low' : 'high',
      key: `shared_image:${otherList.map((o) => o.p.id).sort().join(',')}`,
      message: sameModel
        ? `אותן תמונות כמו במודעה אחרת של אותו דגם — אולי מודעה כפולה`
        : `${positions.length === 1 ? 'תמונה' : `${positions.length} תמונות`} של מוצר אחר${label ? ' (כולל התמונה הראשונה — תווית המחסן)' : ''}`,
      details: {
        related: otherList.map(rel),
        positions,
        imageUrls: positions.map((n) => x.p.images.find((u) => ebayImageId(u) === x.imageIds[n - 1]) ?? '').filter(Boolean),
      },
    })
  }

  // ── פרטי המוצר מול הכותרת והתיאור ──
  const brands = knownBrands(all)
  for (const x of all) {
    const parts = x.mpn ? splitParts(dropRev(x.mpn)).map(squash).filter((m) => m.length >= 4) : []
    // הדגם בלי הגרסה ("AS11880G-32 REV 02" → AS11880G32) — מספיק שהוא בכותרת
    const bases = x.mpn ? splitParts(x.mpn.split(/\bREV/i)[0]).map(squash).filter((m) => m.length >= 4) : []
    const brandInTitle = x.brand ? containsBrand(x.titleSq, x.brand) : true
    const brandInDesc = x.brand ? containsBrand(x.descSq, x.brand) : false
    const mpnInTitle = parts.length ? [...parts, ...bases].some((m) => x.titleSq.includes(m)) : true
    const mpnInDesc = parts.some((m) => x.descSq.includes(m))
    const hasDesc = x.descSq.length > 0
    /** התיאור מזכיר לפחות מספר דגם אחד מהכותרת */
    const descHasTitleModel = !x.models.length || x.models.some((m) => x.descSq.includes(m))
    /** תחילת התיאור מזכירה מספר דגם שלא בכותרת — כלומר התיאור מדבר על מוצר מסוים, לא טקסט כללי */
    const descOtherModels = modelTokens(x.descStart).filter((m) => !x.titleSq.includes(m))
    const specsLabel = [x.brand, x.mpn].filter(Boolean).join(' · ')

    // 1. הכותרת על מוצר אחד, והתיאור + הפרטים מסכימים ביניהם על מוצר אחר
    if (hasDesc && !descHasTitleModel && parts.length && !mpnInTitle && mpnInDesc && !(x.brand && brandInTitle && !brandInDesc)) {
      issues.push({
        productId: x.p.id,
        check: 'title_content',
        severity: 'high',
        key: `title_content:${x.models.join(',')}:${parts.join(',')}`,
        message: `הכותרת לא תואמת לתוכן: התיאור ופרטי המוצר מדברים על ${specsLabel}, והכותרת על מוצר אחר`,
        details: { expected: specsLabel, found: x.models.join(', '), field: 'Title', descStart: x.descStart },
      })
      continue
    }

    // 2. התיאור לא מזכיר את הדגם שבכותרת, ומזכיר דגם אחר
    if (hasDesc && !descHasTitleModel && descOtherModels.length) {
      issues.push({
        productId: x.p.id,
        check: 'desc_mismatch',
        severity: 'medium',
        key: `desc_mismatch:${x.models.join(',')}`,
        message: `התיאור מדבר על ${descOtherModels.slice(0, 2).join(', ')} ולא מזכיר את הדגם שבכותרת (${x.models.slice(0, 3).join(', ')})`,
        details: { expected: x.models.join(', '), found: descOtherModels.join(', '), field: 'Description', descStart: x.descStart },
      })
    }

    // 3. מותג ודגם בפרטים שלא מופיעים בשום מקום אחר
    if (x.brand && parts.length && !brandInTitle && !mpnInTitle && !brandInDesc && !mpnInDesc) {
      issues.push({
        productId: x.p.id,
        check: 'specifics_other',
        severity: 'medium',
        key: `specifics_other:${squash(x.brand)}:${parts.join(',')}`,
        message: `המותג והדגם בפרטי המוצר (${specsLabel}) לא מופיעים בכותרת ולא בתיאור — אולי הפרטים של מוצר אחר`,
        details: { expected: specsLabel, field: 'Item specifics' },
      })
      continue
    }

    // 4. דגם כמעט זהה — ספרה או אות אחת שונה
    if (parts.length && !mpnInTitle) {
      const near = parts.map((m) => nearMiss(m, x.p.title)).find(Boolean)
      if (near) {
        issues.push({
          productId: x.p.id,
          check: 'mpn_near_miss',
          severity: 'medium',
          key: `mpn_near_miss:${parts.join(',')}:${near}`,
          message: `הדגם בפרטים (${x.mpn}) כמעט זהה לדגם בכותרת (${near}), אבל לא זהה — אחד מהם לא עודכן`,
          details: { expected: x.mpn!, found: near, field: 'MPN' },
        })
      }
    }

    // 5. הכותרת מזכירה מותג מוכר אחר
    if (x.brand && !brandInTitle) {
      const own = squash(x.brand)
      const other = brands.find((b) => b.sq !== own && !own.includes(b.sq) && !b.sq.includes(own) && wordIn(x.p.title, b.name))
      if (other) {
        issues.push({
          productId: x.p.id,
          check: 'brand_conflict',
          severity: 'medium',
          key: `brand_conflict:${own}:${other.sq}`,
          message: `בפרטים המותג הוא ${x.brand}, אבל הכותרת מזכירה את ${other.name}`,
          details: { expected: x.brand, found: other.name, field: 'Brand' },
        })
      }
    }
  }

  return issues
}
