import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { searchItems, sellerItemsUrl } from '@/lib/ebay/browse'
import { writeSyncLog } from '@/lib/sync/log'
import { OWN_SELLERS } from './check'
import { classifyOffer, compactPart, conditionGroup, priceStats, round2, totalPrice, usableMpn, type ConditionGroup, type MatchLevel, type PriceStats, type QuoteCondition } from './match'

export { conditionFromText, type QuoteCondition } from './match'

// בדיקת הצעת לקוח: מספר חלק + מחיר מוצע → איפה המחיר עומד מול מה שמוכרים אחרים מבקשים ב-eBay,
// ומול המחיר שלנו אם החלק בקטלוג. קריאה אחת ל-eBay (חיפוש, GET). לא נשמר דבר מלבד שורת לוג בלי פרטי לקוח.

export interface QuoteInput {
  mpn: string
  brand?: string | null
  condition: QuoteCondition
  /** המחיר שהלקוח מציע (USD). null = רק לראות את השוק */
  offer: number | null
  country?: string
}

export interface QuoteOffer {
  itemId: string
  title: string
  seller: string | null
  sellerUrl: string | null
  price: number | null
  shipping: number | null
  total: number | null
  condition: string | null
  conditionGroup: ConditionGroup
  country: string | null
  url: string | null
  matchLevel: MatchLevel
  /** נכלל בחישוב (התאמה מלאה/סבירה, אותו מצב אם נבחר, מחיר ב-USD, לא מכירה פומבית בלבד) */
  compared: boolean
  excludeReason: string | null
}

export interface CatalogMatch {
  productId: string
  sku: string
  title: string
  price: number | null
  conditionGroup: ConditionGroup
  ebayItemId: string | null
}

export interface QuoteResult {
  mpn: string
  condition: QuoteCondition
  country: string
  offer: number | null
  totalResults: number
  /** מחיר פריט בלבד — מה שהלקוח מציע הוא מחיר לחלק */
  market: PriceStats
  offers: QuoteOffer[]
  /** החלק אצלנו בקטלוג (לפי מספר חלק מנורמל) */
  ours: CatalogMatch[]
  /** % הפרש בין ההצעה למחיר שלנו (הראשון): שלילי = הלקוח מציע פחות */
  vsOursPct: number | null
  checkedAt: string
}

export class QuoteInputError extends Error {}

async function catalogMatches(mpn: string): Promise<CatalogMatch[]> {
  const c = compactPart(mpn)
  const rows = (
    await db.execute<{ productId: string; sku: string; title: string; price: string | null; conditionId: string | null; ebayItemId: string | null }>(sql`
      select p.id as "productId", m.sku, p.title, p.price, p.condition_id as "conditionId", m.ebay_item_id as "ebayItemId"
      from products p join channel_mappings m on m.product_id = p.id
      where not p.archived and regexp_replace(upper(coalesce(p.mpn, '')), '[^A-Z0-9]', '', 'g') = ${c}
      order by p.price desc nulls last
      limit 5`)
  ).rows
  return rows.map((r) => ({ ...r, price: r.price != null ? Number(r.price) : null, conditionGroup: conditionGroup(r.conditionId) }))
}

export async function checkQuote(input: QuoteInput): Promise<QuoteResult> {
  const mpn = usableMpn(input.mpn)
  if (!mpn) throw new QuoteInputError('מספר חלק קצר מדי או לא תקין — צריך לפחות 4 תווים וספרה אחת')
  if (input.offer != null && !(Number.isFinite(input.offer) && input.offer > 0)) throw new QuoteInputError('המחיר המוצע צריך להיות מספר חיובי')
  const country = (input.country ?? 'US').toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new QuoteInputError('מדינה לא תקינה')
  const brand = input.brand?.trim() || null
  const started = Date.now()

  const [res, ours] = await Promise.all([searchItems({ q: mpn, excludeSellers: OWN_SELLERS, limit: 50, location: { country } }), catalogMatches(mpn)])

  const offers: QuoteOffer[] = res.items
    .filter((i) => !i.seller || !OWN_SELLERS.some((s) => s.toLowerCase() === i.seller!.toLowerCase()))
    .map((i) => {
      const g = conditionGroup(i.conditionId)
      // "any": משווים בכל מצב — מעבירים לסיווג את קבוצת המצב של המודעה עצמה
      const k = classifyOffer(i, { mpn, brand }, input.condition === 'any' ? g : input.condition)
      return {
        itemId: i.itemId,
        title: i.title,
        seller: i.seller,
        sellerUrl: i.seller ? sellerItemsUrl(i.seller) : null,
        price: i.price != null ? Number(i.price) : null,
        shipping: i.shipping != null ? Number(i.shipping) : null,
        total: totalPrice(i.price, i.shipping),
        condition: i.condition,
        conditionGroup: g,
        country: i.country,
        url: i.url,
        matchLevel: k.match.level,
        compared: k.compared,
        excludeReason: k.excludeReason,
      }
    })
    .sort((a, b) => Number(b.compared) - Number(a.compared) || (a.price ?? Infinity) - (b.price ?? Infinity))

  const market = priceStats(input.offer, offers.filter((o) => o.compared).map((o) => o.price!))
  const ourPrice = ours.find((o) => o.price != null)?.price ?? null
  const vsOursPct = input.offer != null && ourPrice ? round2(((input.offer - ourPrice) / ourPrice) * 100) : null

  // לוג בלי פרטי לקוח ובלי המחיר המוצע — רק מה נבדק ומה נמצא
  await writeSyncLog({
    job: 'price-quote',
    channel: 'ebay',
    action: 'quote_check',
    success: true,
    durationMs: Date.now() - started,
    details: { mpn, condition: input.condition, country, results: res.total, compared: market.count, inCatalog: ours.length },
  })

  return { mpn, condition: input.condition, country, offer: input.offer, totalResults: res.total, market, offers, ours, vsOursPct, checkedAt: new Date().toISOString() }
}
