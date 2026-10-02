// סיכום התנהלות של לקוח — כללים קבועים, בלי AI. פונקציה טהורה (צד שרת וצד לקוח).
// רמות: good = לקוח טוב · ok = תקין · watch = לשים לב · risk = בעייתי · new = עוד אין מספיק מידע.
// מה לא נחשב נגד הלקוח: ביטול שהמוכרת יזמה (למשל אזל במלאי), החזר כספי בלי החזרה או קייס (יכול להיות מחווה של המוכרת).

export type BehaviorLevel = 'good' | 'ok' | 'watch' | 'risk' | 'new'
export type SignalTone = 'ok' | 'warn' | 'bad' | 'gray'

export interface BehaviorInput {
  /** הזמנות שלא בוטלו ולא הוחזר עליהן כסף */
  orders: number
  /** כל ההזמנות, כולל שבוטלו */
  ordersAll: number
  cancelsBuyer: number
  cancelsSeller: number
  cancelsOther: number
  refunds: number
  refundAmount: number
  returns: number
  /** החזרות בטענת "לא כמו בתיאור" / פגום */
  returnsSnad: number
  inquiries: number
  /** קייסים שהוסלמו ל-eBay */
  cases: number
  open: number
  firstOrder: string | null
  ebay: {
    feedbackScore: number | null
    registeredAt: string | null
    feedbackPrivate: boolean | null
    positiveLeft: number | null
    neutralLeft: number | null
    negativeLeft: number | null
    fetchedAt: string | null
  } | null
}

export interface Behavior {
  level: BehaviorLevel
  signals: { tone: SignalTone; text: string }[]
}

const DAY = 86400_000
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n.toLocaleString('en-US')} ${many}`)

export function summarizeBehavior(i: BehaviorInput, now = Date.now()): Behavior {
  const signals: Behavior['signals'] = []
  let risk = 0
  let watch = 0

  // ── מה קרה בהזמנות מאיתנו ──
  if (i.cases > 0) {
    risk++
    signals.push({ tone: 'bad', text: `${plural(i.cases, 'קייס אחד', 'קייסים')} שהוסלמו ל-eBay` })
  }
  const complaints = i.returns + i.inquiries
  if (i.returns > 0) {
    if (i.returns >= 2 && i.ordersAll > 0 && i.returns / i.ordersAll >= 0.3) risk++
    else watch++
    signals.push({ tone: i.returns >= 2 ? 'bad' : 'warn', text: `${plural(i.returns, 'בקשת החזרה אחת', 'בקשות החזרה')}${i.returnsSnad ? ` (${i.returnsSnad === 1 ? 'אחת' : i.returnsSnad} בטענה "לא כמו בתיאור" / פגום)` : ''}` })
  }
  if (i.inquiries > 0) {
    watch++
    signals.push({ tone: 'warn', text: `${plural(i.inquiries, 'פנייה אחת', 'פניות')} "לא קיבלתי את הפריט"` })
  }
  if (complaints >= 3) risk++
  if (i.cancelsBuyer > 0) {
    if (i.cancelsBuyer >= 2) watch++
    signals.push({ tone: i.cancelsBuyer >= 2 ? 'warn' : 'gray', text: `${plural(i.cancelsBuyer, 'ביקש לבטל הזמנה אחת', 'ביטולים שהלקוח ביקש')}` })
  }
  if (i.cancelsSeller > 0) signals.push({ tone: 'gray', text: `${plural(i.cancelsSeller, 'הזמנה אחת בוטלה', 'הזמנות בוטלו')} ע״י המוכרת — לא נחשב נגד הלקוח` })
  if (i.cancelsOther > 0) signals.push({ tone: 'gray', text: `${plural(i.cancelsOther, 'ביטול אחד', 'ביטולים')} בלי מידע מי יזם` })
  if (i.refunds > 0) signals.push({ tone: 'gray', text: `${plural(i.refunds, 'החזר כספי אחד', 'החזרים כספיים')} · $${Math.round(i.refundAmount).toLocaleString('en-US')}` })
  if (i.open > 0) signals.push({ tone: 'warn', text: `${plural(i.open, 'אירוע אחד פתוח', 'אירועים פתוחים')} עכשיו — מחכה לטיפול` })

  // ── פרופיל ב-eBay ──
  const e = i.ebay
  if (e?.fetchedAt) {
    const given = (e.positiveLeft ?? 0) + (e.neutralLeft ?? 0) + (e.negativeLeft ?? 0)
    const neg = e.negativeLeft ?? 0
    if (e.negativeLeft !== null && given > 0) {
      const share = neg / given
      if (neg >= 3 && share >= 0.05) {
        risk++
        signals.push({ tone: 'bad', text: `נתן ${neg.toLocaleString('en-US')} פידבקים שליליים למוכרים (${Math.round(share * 100)}% מהפידבק שנתן)` })
      } else if (neg > 0) {
        watch++
        signals.push({ tone: 'warn', text: `נתן ${plural(neg, 'פידבק שלילי אחד', 'פידבקים שליליים')} למוכרים מתוך ${given.toLocaleString('en-US')}` })
      } else {
        signals.push({ tone: 'ok', text: `לא נתן אף פידבק שלילי (${given.toLocaleString('en-US')} פידבקים למוכרים)` })
      }
    }
    if (e.registeredAt && i.firstOrder) {
      const age = new Date(i.firstOrder).getTime() - new Date(e.registeredAt).getTime()
      if (age >= 0 && age < 30 * DAY) {
        watch++
        signals.push({ tone: 'warn', text: 'החשבון ב-eBay נפתח פחות מחודש לפני ההזמנה הראשונה' })
      }
    }
    if (e.registeredAt) {
      const years = (now - new Date(e.registeredAt).getTime()) / (365.25 * DAY)
      if (years >= 3) signals.push({ tone: 'ok', text: `ב-eBay מאז ${new Date(e.registeredAt).getFullYear()}` })
    }
    if (e.feedbackScore !== null) {
      if (e.feedbackScore < 5) {
        watch++
        signals.push({ tone: 'warn', text: `ציון פידבק נמוך ב-eBay (${e.feedbackScore}) — מעט קניות קודמות` })
      } else if (e.feedbackScore >= 50) signals.push({ tone: 'ok', text: `ציון פידבק ${e.feedbackScore.toLocaleString('en-US')} ב-eBay` })
    }
    if (e.feedbackPrivate) signals.push({ tone: 'gray', text: 'פרופיל הפידבק ב-eBay מוגדר כפרטי' })
  }

  // ── לקוח חוזר נקי ──
  const clean = i.cases + i.returns + i.inquiries + i.cancelsBuyer === 0
  if (clean && i.orders >= 2) signals.unshift({ tone: 'ok', text: `לקוח חוזר — ${i.orders.toLocaleString('en-US')} הזמנות בלי בעיות` })

  // לקוח עם הזמנה אחת ובלי פרופיל eBay — עוד אין על מה להסתמך
  const level: BehaviorLevel = risk > 0 ? 'risk' : watch > 0 ? 'watch' : clean && i.orders >= 2 ? 'good' : i.ordersAll <= 1 && !e?.fetchedAt ? 'new' : 'ok'
  return { level, signals }
}
