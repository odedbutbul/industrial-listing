import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getItemShipping, searchItems, type BrowseItem, type ShippingQuote } from '@/lib/ebay/browse'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import {
  conditionGroup,
  matchListing,
  priceStats,
  totalPrice,
  usableMpn,
  type ConditionGroup,
  type MatchResult,
  type PriceStats,
} from './match'

// בדיקת מחירים מול מתחרים ב-eBay: לכל מוצר ולכל מדינת יעד — חיפוש לפי מספר החלק (Browse API, GET בלבד),
// התאמה לפי הכותרת, והשוואה רק מול מודעות באותה קבוצת מצב.
// ההשוואה העיקרית היא מחיר כולל משלוח עד הקונה (אנחנו שולחים מישראל); מחיר פריט בלבד — משני.
// שום דבר לא משתנה ב-eBay או בחנות.

const JOB = 'price-check'
/** החשבון שלנו — לא משווים מול עצמנו */
const OWN_SELLERS = ['vizvik16']
const DELAY_MS = 300

export interface CheckOptions {
  /** מוצרים לפי SKU. אם לא נבחרו — מבחר של מוצרים ממותגים שונים (פיילוט) */
  skus?: string[]
  limit?: number
  /** מדינות הקונה (ISO-2). ברירת מחדל: US */
  countries?: string[]
  dryRun?: boolean
}

export interface OfferRow {
  item: BrowseItem
  match: MatchResult
  group: ConditionGroup
  compared: boolean
  excludeReason: string | null
}

export interface ProductCheck {
  productId: string
  sku: string
  title: string
  brand: string | null
  mpn: string
  country: string
  query: string
  ourPrice: number | null
  /** המשלוח הזול שלנו למדינה. null = לא ידוע / לא שולחים */
  ourShipping: number | null
  ourShippingOptions: ShippingQuote[]
  group: ConditionGroup
  totalResults: number
  offers: OfferRow[]
  /** ההשוואה הקובעת (לפי basis) */
  stats: PriceStats
  basis: 'total' | 'item'
  /** מחיר פריט בלבד */
  item: PriceStats
  total: PriceStats
  error: string | null
}

export interface CheckRunResult {
  runId: string
  dryRun: boolean
  products: number
  countries: string[]
  apiCalls: number
  errors: number
  withCompetitors: number
  checks: ProductCheck[]
  /** מוכרים שחוזרים הכי הרבה בהתאמות — המתחרים הישירים */
  topSellers: { seller: string; products: number; offers: number }[]
  skipped: { sku: string; reason: string }[]
}

type Candidate = {
  productId: string
  sku: string
  ebayItemId: string | null
  title: string
  brand: string | null
  mpn: string | null
  price: string | null
  conditionId: string | null
  shippingCosts: (typeof schema.products.$inferSelect)['shippingCosts']
}

async function loadCandidates(opts: CheckOptions): Promise<Candidate[]> {
  const p = schema.products
  const m = schema.channelMappings
  const cols = {
    productId: p.id,
    sku: m.sku,
    ebayItemId: m.ebayItemId,
    title: p.title,
    brand: p.brand,
    mpn: p.mpn,
    price: p.price,
    conditionId: p.conditionId,
    shippingCosts: p.shippingCosts,
  }
  if (opts.skus?.length) {
    return db.select(cols).from(p).innerJoin(m, eq(m.productId, p.id)).where(inArray(m.sku, opts.skus))
  }
  // פיילוט: מוצר אחד לכל מותג (היקר ביותר), מודעה פעילה ב-eBay עם MPN ומחיר
  const rows = await db
    .selectDistinctOn([sql`lower(${p.brand})`], cols)
    .from(p)
    .innerJoin(m, eq(m.productId, p.id))
    .where(and(eq(p.archived, false), isNotNull(p.mpn), isNotNull(p.price), isNotNull(p.brand), isNotNull(m.ebayItemId)))
    .orderBy(sql`lower(${p.brand})`, sql`${p.price} desc`)
  return rows
    .filter((r) => usableMpn(r.mpn))
    .sort((a, b) => Number(b.price) - Number(a.price))
    .slice(0, opts.limit ?? 20)
}

/** גיבוי כשאין מודעה חיה לקרוא ממנה: המשלוח לארה"ב שנשמר מ-GetItem (products.shipping_costs) */
function storedUsShipping(c: Candidate): number | null {
  const us = c.shippingCosts?.us
  if (!us) return null
  if (us.free) return 0
  return us.cost != null && Number.isFinite(Number(us.cost)) ? Number(us.cost) : null
}

function classify(item: BrowseItem, ours: { mpn: string; brand: string | null }, group: ConditionGroup): OfferRow {
  const match = matchListing(ours, item.title)
  const g = conditionGroup(item.conditionId)
  let excludeReason: string | null = null
  if (match.level === 'weak') excludeReason = 'התאמה חלשה'
  else if (g !== group) excludeReason = 'מצב אחר'
  else if (item.price == null) excludeReason = 'אין מחיר'
  else if (item.currency !== 'USD') excludeReason = `מטבע ${item.currency}`
  else if (!item.buyingOptions.some((o) => o === 'FIXED_PRICE' || o === 'BEST_OFFER')) excludeReason = 'מכירה פומבית בלבד'
  return { item, match, group: g, compared: excludeReason === null, excludeReason }
}

/** המשלוח שלנו למדינה — מהמודעה החיה ב-eBay, כמו שהקונה רואה אותו */
async function ourShipping(c: Candidate, country: string): Promise<{ cost: number | null; options: ShippingQuote[]; calls: number }> {
  if (c.ebayItemId) {
    const s = await getItemShipping(c.ebayItemId, { country })
    const first = s.options.find((o) => o.cost != null && o.currency === 'USD')
    return { cost: first ? Number(first.cost) : null, options: s.options, calls: 1 }
  }
  return { cost: country === 'US' ? storedUsShipping(c) : null, options: [], calls: 0 }
}

async function checkOne(c: Candidate, country: string, excludeSellers: string[]): Promise<ProductCheck & { calls: number }> {
  const mpn = usableMpn(c.mpn)!
  const group = conditionGroup(c.conditionId)
  const ourPrice = c.price != null ? Number(c.price) : null
  const base = { productId: c.productId, sku: c.sku, title: c.title, brand: c.brand, mpn, country, query: mpn, ourPrice, group }
  let calls = 0
  let ship: Awaited<ReturnType<typeof ourShipping>> = { cost: null, options: [], calls: 0 }

  try {
    ship = await ourShipping(c, country).catch(() => ship) // משלוח שלנו לא זמין → ממשיכים עם מחיר פריט בלבד
    calls += ship.calls || (c.ebayItemId ? 1 : 0)
    const res = await searchItems({ q: mpn, excludeSellers, limit: 50, location: { country } })
    calls++
    const offers = res.items
      // ביטחון כפול: גם אם הסינון של eBay לא תפס — לא משווים מול עצמנו
      .filter((i) => !i.seller || !excludeSellers.some((s) => s.toLowerCase() === i.seller!.toLowerCase()))
      .map((i) => classify(i, { mpn, brand: c.brand }, group))
    const compared = offers.filter((o) => o.compared)
    const item = priceStats(ourPrice, compared.map((o) => Number(o.item.price)))
    const total = priceStats(
      totalPrice(ourPrice, ship.cost),
      compared.map((o) => totalPrice(o.item.price, o.item.shipping)).filter((v): v is number => v != null),
    )
    const useTotal = total.count > 0 && total.position !== 'no_price'
    return {
      ...base,
      ourShipping: ship.cost,
      ourShippingOptions: ship.options,
      totalResults: res.total,
      offers,
      stats: useTotal ? total : item,
      basis: useTotal ? 'total' : 'item',
      item,
      total,
      error: null,
      calls,
    }
  } catch (err) {
    const empty = priceStats(null, [])
    return {
      ...base,
      ourShipping: ship.cost,
      ourShippingOptions: ship.options,
      totalResults: 0,
      offers: [],
      stats: empty,
      basis: 'item',
      item: empty,
      total: empty,
      error: err instanceof Error ? err.message : String(err),
      calls,
    }
  }
}

const num = (v: number | null) => (v == null ? null : String(v))

async function saveCheck(runId: string, r: ProductCheck): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.priceChecks)
      .values({
        runId,
        productId: r.productId,
        country: r.country,
        query: r.query,
        totalResults: r.totalResults,
        ourPrice: num(r.ourPrice),
        ourShipping: num(r.ourShipping),
        ourShippingOptions: r.ourShippingOptions,
        conditionGroup: r.group,
        compareCount: r.stats.count,
        minPrice: num(r.stats.min),
        medianPrice: num(r.stats.median),
        maxPrice: num(r.stats.max),
        vsMedianPct: num(r.stats.vsMedianPct),
        vsMinPct: num(r.stats.vsMinPct),
        position: r.stats.position,
        basis: r.basis,
        itemStats: r.item,
        error: r.error,
      })
      .returning({ id: schema.priceChecks.id })
    // מודעה יכולה לחזור פעמיים באותו חיפוש — שומרים פעם אחת
    const seen = new Set<string>()
    const offers = r.offers.filter((o) => (seen.has(o.item.itemId) ? false : (seen.add(o.item.itemId), true)))
    if (!offers.length) return
    await tx.insert(schema.competitorOffers).values(
      offers.map((o) => ({
        checkId: row.id,
        productId: r.productId,
        ebayItemId: o.item.itemId,
        legacyItemId: o.item.legacyItemId,
        title: o.item.title,
        seller: o.item.seller,
        sellerFeedbackScore: o.item.sellerFeedbackScore,
        price: o.item.price,
        currency: o.item.currency,
        shipping: o.item.shipping,
        shippingType: o.item.shippingType,
        conditionId: o.item.conditionId,
        condition: o.item.condition,
        conditionGroup: o.group,
        buyingOptions: o.item.buyingOptions,
        url: o.item.url,
        country: o.item.country,
        matchLevel: o.match.level,
        matchScore: o.match.score,
        compared: o.compared,
      })),
    )
  })
}

function topSellers(checks: ProductCheck[]) {
  const map = new Map<string, { products: Set<string>; offers: number }>()
  for (const c of checks) {
    for (const o of c.offers) {
      if (o.match.level === 'weak' || !o.item.seller) continue
      const e = map.get(o.item.seller) ?? { products: new Set(), offers: 0 }
      e.products.add(c.productId)
      e.offers++
      map.set(o.item.seller, e)
    }
  }
  return Array.from(map.entries())
    .map(([seller, e]) => ({ seller, products: e.products.size, offers: e.offers }))
    .sort((a, b) => b.products - a.products || b.offers - a.offers)
    .slice(0, 25)
}

export async function runPriceCheck(opts: CheckOptions = {}): Promise<CheckRunResult> {
  return withJobLock(JOB, async () => {
    const runId = randomUUID()
    const started = Date.now()
    const dryRun = !!opts.dryRun

    const own = await db
      .select({ u: schema.ebayTokens.ebayUserId })
      .from(schema.ebayTokens)
      .then((rows) => rows.map((r) => r.u).filter((u): u is string => !!u))
    const excludeSellers = Array.from(new Set(OWN_SELLERS.concat(own)))
    const countries = Array.from(new Set((opts.countries?.length ? opts.countries : ['US']).map((c) => c.trim().toUpperCase()))).filter((c) =>
      /^[A-Z]{2}$/.test(c),
    )

    const all = await loadCandidates(opts)
    const skipped: CheckRunResult['skipped'] = []
    const candidates = all.filter((c) => {
      if (usableMpn(c.mpn)) return true
      skipped.push({ sku: c.sku, reason: c.mpn ? `MPN לא שמיש: "${c.mpn}"` : 'אין MPN' })
      return false
    })

    const checks: ProductCheck[] = []
    let apiCalls = 0
    for (const c of candidates) {
      for (const country of countries) {
        if (apiCalls > 0) await new Promise((r) => setTimeout(r, DELAY_MS))
        const { calls, ...r } = await checkOne(c, country, excludeSellers)
        apiCalls += calls
        checks.push(r)
        if (!dryRun) {
          await saveCheck(runId, r)
          await writeSyncLog({
            runId,
            job: JOB,
            channel: 'ebay',
            action: 'price_check',
            productId: r.productId,
            success: !r.error,
            error: r.error,
            details: { country, query: r.query, results: r.totalResults, compared: r.stats.count, basis: r.basis, position: r.stats.position },
          })
        }
      }
    }

    const result: CheckRunResult = {
      runId,
      dryRun,
      products: candidates.length,
      countries,
      apiCalls,
      errors: checks.filter((c) => c.error).length,
      withCompetitors: checks.filter((c) => c.stats.count > 0).length,
      checks,
      topSellers: topSellers(checks),
      skipped,
    }
    if (!dryRun) {
      await writeSyncLog({
        runId,
        job: JOB,
        channel: 'ebay',
        action: 'price_check_run',
        success: result.errors === 0,
        durationMs: Date.now() - started,
        details: {
          products: result.products,
          countries,
          apiCalls: result.apiCalls,
          errors: result.errors,
          withCompetitors: result.withCompetitors,
          skipped: skipped.length,
          topSellers: result.topSellers.slice(0, 10),
        },
      })
    }
    return result
  })
}
