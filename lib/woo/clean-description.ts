// ניקוי תיאור eBay לפני כתיבה ל-WooCommerce.
// 1. HTML → רשימה סגורה של תגיות, בלי מאפיינים (בלי font / style / span / div / u).
// 2. הסרת בלוקי התבנית של eBay: Payment / Shipping / Returns / Feedback / International / Important Points,
//    שורות שמזכירות eBay, ושורות שיווק כלליות של החשבון. מדיניות החנות יושבת בעמודים שלה, לא בתיאור.
// 3. שורה ראשונה שחוזרת על שם המוצר — מוסרת (הכותרת כבר מוצגת בעמוד).
// התוצאה יכולה להיות ריקה — ה-theme מסתיר תיאור ריק.

type Kind = 'p' | 'li' | 'h'
interface Line {
  kind: Kind
  html: string
}

const INLINE: Record<string, string> = { strong: 'strong', b: 'strong', em: 'em', i: 'em' }
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const BLOCK_TAGS = new Set(['p', 'div', 'li', 'ul', 'ol', 'tr', 'table', 'hr', 'section', 'center', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'noscript', 'template', 'svg', 'head', 'title'])

/** כותרות של בלוקי מדיניות/תבנית: הכותרת וכל מה שאחריה עד הכותרת הבאה נמחקים */
const POLICY_HEADING =
  /^(feedback|international( shipping)?|shipping( (and|&) (handling|returns?|return policy))?|shipping & return policy|payments?( terms| methods?)?|return policy|returns?( policy)?|important points for buyers|warranty|terms( of sale)?|about us|contact us|customs)$/i

/** שורות שנמחקות בכל מקום בתיאור */
const DROP_LINE = [
  /\bebay\b/i,
  /\bfeedback\b/i,
  /we pride ourselves/i,
  /discover our wide selection/i,
  /tailored to meet your diverse needs/i,
  /^\W*(brand )?(new|used)( condition)?$/i, // מצב — כבר מוצג משדה Condition
  /thank you for (shopping|your (interest|purchase))/i,
  /your satisfaction is our priority/i,
  /tech solutions team/i,
  /\bwarranty\b/i,
  /\bfedex\b/i,
  /\bpaypal\b/i,
  /don['’]?t hesitate to contact/i,
  /what you see is what you get/i,
  /all photos are of the actual item/i,
]

/** ✅ 📦 🔁 בתחילת שורה — קישוט של תבנית eBay (בלי דגל u: ה-tsconfig מכוון ל-ES5) */
const LEADING_EMOJI = /^((?:<(?:strong|em)>)*)\s*(?:[\u2600-\u27BF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDEFF]|\uD83E[\uDD00-\uDDFF])\uFE0F?\s*/

const decode = (s: string) =>
  s
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

const textOf = (html: string) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** טקסט גולמי (בין תגיות) → בטוח ל-HTML. ישויות קיימות נשמרות, `<` `>` בודדים מוברחים */
const safeText = (s: string) => s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** מפרק את ה-HTML לשורות: כל בלוק, כל <li> וכל <br> מתחילים שורה חדשה */
function toLines(html: string): Line[] {
  const lines: Line[] = []
  let cur = ''
  let kind: Kind = 'p'
  let dropDepth = 0
  const open: string[] = [] // תגיות inline פתוחות בשורה הנוכחית

  const flush = () => {
    for (let i = open.length - 1; i >= 0; i--) cur += `</${open[i]}>`
    const t = textOf(cur)
    if (t) lines.push({ kind, html: cur.replace(/\s+/g, ' ').trim() })
    cur = open.map((o) => `<${o}>`).join('')
    kind = 'p'
  }

  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][\w-]*)[^>]*>|([^<]+)|(<)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, close, rawTag, text, stray] = m
    if (text !== undefined || stray !== undefined) {
      if (!dropDepth) cur += safeText(text ?? '<')
      continue
    }
    if (!rawTag) continue // הערה
    const tag = rawTag.toLowerCase()
    if (DROP_WITH_CONTENT.has(tag)) {
      dropDepth = Math.max(0, dropDepth + (close ? -1 : 1))
      continue
    }
    if (dropDepth) continue
    if (tag === 'br') {
      flush()
      continue
    }
    if (BLOCK_TAGS.has(tag)) {
      flush()
      if (!close && tag === 'li') kind = 'li'
      else if (!close && HEADING_TAGS.has(tag)) kind = 'h'
      continue
    }
    const inl = INLINE[tag]
    if (!inl) continue // span, font, u, a, img… — התגית נזרקת, הטקסט נשאר
    if (close) {
      const at = open.lastIndexOf(inl)
      if (at >= 0) {
        cur += `</${inl}>`
        open.splice(at, 1)
      }
    } else {
      cur += `<${inl}>`
      open.push(inl)
    }
  }
  flush()
  // תגיות inline ריקות שנשארו מפיצול שורות
  return lines.map((l) => ({ ...l, html: l.html.replace(/<(strong|em)>\s*<\/\1>/g, '').trim() })).filter((l) => textOf(l.html))
}

/** שורה שהיא כותרת: תגית h, או טקסט קצר שמסתיים בנקודתיים */
const isHeading = (l: Line) => {
  const t = textOf(l.html)
  return l.kind === 'h' || (l.kind === 'p' && t.length <= 60 && /:\s*$/.test(t))
}
const headingKey = (l: Line) =>
  textOf(l.html)
    .replace(/[^A-Za-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export interface CleanResult {
  html: string
  /** טקסט השורות שהוסרו — לתצוגה מקדימה ולבדיקה */
  removed: string[]
}

export function cleanDescription(raw: string | null | undefined, title = ''): CleanResult {
  if (!raw) return { html: '', removed: [] }
  const lines = toLines(raw)
  const kept: Line[] = []
  const removed: string[] = []
  let inPolicy = false

  lines.forEach((l, i) => {
    const t = textOf(l.html)
    // שורה ראשונה: זהה לשם → נמחקת; מתחילה כמו השם (השם המלא, לפני חיתוך 80 התווים של eBay) → נשארת כפסקה
    if (i === 0 && title) {
      const a = alnum(t)
      const b = alnum(title)
      if (a === b) return void removed.push(t)
      if (b && a.startsWith(b.slice(0, 20))) l = { kind: 'p', html: l.html }
    }
    if (isHeading(l)) inPolicy = POLICY_HEADING.test(headingKey(l))
    // חתימת החשבון סוגרת את בלוק המדיניות — מה שבא אחריה הוא שוב מידע על המוצר
    if (/tech solutions team/i.test(t)) {
      inPolicy = false
      return void removed.push(t)
    }
    if (inPolicy) return void removed.push(t)
    if (!DROP_LINE.some((r) => r.test(t))) return void kept.push(l)
    // שורה קצרה (כותרת / נקודה) נמחקת כולה. פסקה ארוכה — רק המשפט שמזכיר מדיניות, כדי לא לאבד מידע על המוצר
    if (t.length <= 160) return void removed.push(t)
    const sentences = t.split(/(?<=[.!?])\s+/)
    const keep = sentences.filter((x) => !DROP_LINE.some((r) => r.test(x)))
    removed.push(...sentences.filter((x) => !keep.includes(x)))
    if (keep.length) kept.push({ kind: l.kind, html: safeText(keep.join(' ')) })
  })

  // כותרת שלא נשאר אחריה תוכן
  for (const l of kept) l.html = l.html.replace(LEADING_EMOJI, '$1')
  // כותרת-תווית ("Shipping:") שלא נשאר אחריה תוכן נמחקת. כותרת h בלי נקודתיים היא תוכן (לרוב שם הפריט) ונשארת
  const isLabel = (l: Line) => isHeading(l) && /:\s*$/.test(textOf(l.html))
  const final = kept.filter((l, i) => !isLabel(l) || (kept[i + 1] && !isHeading(kept[i + 1])))
  for (const l of kept) if (!final.includes(l)) removed.push(textOf(l.html))

  let html = ''
  let inList = false
  for (const l of final) {
    if (l.kind === 'li' && !inList) {
      html += '<ul>'
      inList = true
    }
    if (l.kind !== 'li' && inList) {
      html += '</ul>'
      inList = false
    }
    html += l.kind === 'li' ? `<li>${l.html}</li>` : l.kind === 'h' ? `<h3>${l.html}</h3>` : `<p>${l.html}</p>`
    html += '\n'
  }
  if (inList) html += '</ul>\n'
  return { html: html.trim(), removed }
}

/** כתובת תמונה של eBay בגודל הגדול ($_57 = עד 1600px). $_1 וקודים קטנים אחרים = 400px */
export function ebayLargeImage(url: string): string {
  return /^https:\/\/i\.ebayimg\.com\//.test(url) ? url.replace(/\$_\d+\.(jpe?g|png|webp)/i, (_, ext) => `$_57.${ext}`) : url
}
