import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

// קריאות למסך "מחירים" — רק מ-Postgres (תוצאות הבדיקות האחרונות), בלי eBay.

export type PriceFilter = 'all' | 'expensive' | 'market' | 'cheap' | 'none'

/** מיקומים לפי סינון */
const FILTER_POSITIONS: Record<Exclude<PriceFilter, 'all'>, string[]> = {
  expensive: ['above_median', 'most_expensive'],
  market: ['at_median'],
  cheap: ['cheapest', 'below_median'],
  none: ['only_us', 'no_price'],
}

export type PriceRow = {
  checkId: string
  productId: string
  sku: string
  title: string
  brand: string | null
  mpn: string
  country: string
  checkedAt: string
  conditionGroup: string
  ourPrice: string | null
  ourShipping: string | null
  compareCount: number
  totalResults: number
  minPrice: string | null
  medianPrice: string | null
  maxPrice: string | null
  vsMedianPct: string | null
  vsMinPct: string | null
  position: string
  basis: 'total' | 'item'
  error: string | null
  /** המתחרה הזול בהשוואה */
  cheapestSeller: string | null
}

export type SellerStat = {
  seller: string
  products: number
  offers: number
  /** בכמה מוצרים הוא זול מאיתנו */
  cheaperThanUs: number
}

export interface PricePage {
  rows: PriceRow[]
  counts: Record<PriceFilter, number>
  countries: string[]
  lastCheckedAt: string | null
  sellers: SellerStat[]
}

// הבדיקה האחרונה לכל מוצר × מדינה
const LATEST = sql`
  select distinct on (pc.product_id, pc.country) pc.*
  from price_checks pc
  order by pc.product_id, pc.country, pc.checked_at desc`

export async function listPrices(opts: { filter: PriceFilter; country?: string }): Promise<PricePage> {
  const countries = (await db.execute<{ country: string }>(sql`select distinct country from price_checks order by country`)).rows.map((r) => r.country)
  const country = opts.country && countries.includes(opts.country) ? opts.country : (countries.includes('US') ? 'US' : countries[0]) ?? 'US'

  const rows = (
    await db.execute<PriceRow>(sql`
      with latest as (${LATEST})
      select l.id as "checkId", l.product_id as "productId", m.sku, p.title, p.brand, l.query as mpn, l.country,
             l.checked_at as "checkedAt", l.condition_group as "conditionGroup", l.our_price as "ourPrice", l.our_shipping as "ourShipping",
             l.compare_count as "compareCount", l.total_results as "totalResults", l.min_price as "minPrice", l.median_price as "medianPrice",
             l.max_price as "maxPrice", l.vs_median_pct as "vsMedianPct", l.vs_min_pct as "vsMinPct", l.position, l.basis, l.error,
             (select o.seller from competitor_offers o where o.check_id = l.id and o.compared
               order by (o.price + case when l.basis = 'total' then coalesce(o.shipping, 0) else 0 end) asc limit 1) as "cheapestSeller"
      from latest l
      join products p on p.id = l.product_id
      join channel_mappings m on m.product_id = l.product_id
      where l.country = ${country}
      order by
        case when l.position in ('most_expensive','above_median') then 0 when l.position = 'at_median' then 1
             when l.position in ('below_median','cheapest') then 2 else 3 end,
        l.vs_median_pct desc nulls last, l.our_price desc nulls last`)
  ).rows

  const counts: Record<PriceFilter, number> = { all: rows.length, expensive: 0, market: 0, cheap: 0, none: 0 }
  for (const r of rows) {
    for (const [f, positions] of Object.entries(FILTER_POSITIONS)) if (positions.includes(r.position)) counts[f as PriceFilter]++
  }
  const filtered = opts.filter === 'all' ? rows : rows.filter((r) => FILTER_POSITIONS[opts.filter as Exclude<PriceFilter, 'all'>].includes(r.position))

  const sellers = (
    await db.execute<SellerStat>(sql`
      with latest as (${LATEST})
      select o.seller, count(distinct o.product_id)::int as products, count(*)::int as offers,
             count(distinct o.product_id) filter (
               where o.price + case when l.basis = 'total' then coalesce(o.shipping, 0) else 0 end
                     < l.our_price + case when l.basis = 'total' then coalesce(l.our_shipping, 0) else 0 end)::int as "cheaperThanUs"
      from latest l
      join competitor_offers o on o.check_id = l.id and o.compared and o.seller is not null
      where l.country = ${country}
      group by o.seller
      order by products desc, offers desc
      limit 12`)
  ).rows

  return {
    rows: filtered,
    counts,
    countries,
    lastCheckedAt: rows.reduce<string | null>((a, r) => (!a || r.checkedAt > a ? r.checkedAt : a), null),
    sellers,
  }
}

export type OfferRow = {
  id: number
  title: string
  seller: string | null
  sellerFeedbackScore: number | null
  price: string | null
  shipping: string | null
  currency: string | null
  condition: string | null
  conditionGroup: string
  url: string | null
  country: string | null
  matchLevel: 'exact' | 'likely' | 'weak'
  compared: boolean
  manualMatch: boolean | null
}

export async function listOffers(checkId: string): Promise<OfferRow[]> {
  return (
    await db.execute<OfferRow>(sql`
      select id, title, seller, seller_feedback_score as "sellerFeedbackScore", price, shipping, currency, condition,
             condition_group as "conditionGroup", url, country, match_level as "matchLevel", compared, manual_match as "manualMatch"
      from competitor_offers
      where check_id = ${checkId}
      order by compared desc, case match_level when 'exact' then 0 when 'likely' then 1 else 2 end,
               price + coalesce(shipping, 0) asc nulls last`)
  ).rows.map((r) => ({ ...r, id: Number(r.id) }))
}
