import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getItemShipping, searchCompetitors, type BrowseItem, type ShippingQuote } from '@/lib/ebay/browse'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { classifyOffer, compare, conditionGroup, priceStats, usableMpn, type ConditionGroup, type MatchResult, type PriceStats } from './match'

// בדיקת מחירים מול מתחרים ב-eBay: לכל מוצר ולכל מדינת יעד — חיפוש לפי מספר החלק (Browse API, GET בלבד),
// התאמה לפי הכותרת, והשוואה רק מול מודעות באותה קבוצת מצב.
// ההשוואה העיקרית היא מחיר כולל משלוח עד הקונה (אנחנו שולחים מישראל); מחיר פריט בלבד — משני.
// שום דבר לא משתנה ב-eBay או בחנות.

const JOB = 'price-check'
/** החשבונות של הלקוחה ב-eBay — לא משווים מול עצמנו (vizko2017: אישור עודד 30/09/2026) */
export const OWN_SELLERS = ['vizvik16', 'vizko2017']
const DELAY_MS = 300

export interface CheckOptions {
  /** מוצרים לפי SKU. אם לא נבחרו — מבחר של מוצרים ממותגים שונים (פיילוט) */
  skus?: string[]
  /** כל הקטלוג: קודם מוצרים שלא נבדקו, אחר כך הבדיקה הכי ישנה. limit = תקציב הריצה */
  all?: boolean
  limit?: number
  /** לא לשמור את כל המודעות בתוצאה (ריצה גדולה) — רק את מה שנכנס להשוואה */
  lean?: boolean
  /** תקציב קריאות ל-eBay בריצה (מכסת Browse: 5,000 ביום). ברירת מחדל ב-all: 4,700 */
  maxCalls?: number
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
  /** החלטה ידנית שנשמרה מבדיקה קודמת של אותה מודעה */
  manual?: boolean | null
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
  /** כמה פעמים המשלוח שלנו נלקח מהמערכת במקום מ-eBay */
  shippingReused: number
  /** הריצה נעצרה כי eBay החזיר חריגה ממכסת הקריאות */
  rateLimited: boolean
  /** הריצה נעצרה בתקציב הקריאות (maxCalls) — השאר ייבדק בריצה הבאה */
  budgetReached: boolean
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
  if (opts.all) {
    // כל המוצרים הפעילים: קודם מי שלא נבדק מעולם, אחר כך הבדיקה הכי ישנה; בתוך זה — היקרים קודם
    const lastCheck = sql`(select max(pc.checked_at) from price_checks pc where pc.product_id = ${p.id})`
    const rows = await db
      .select(cols)
      .from(p)
      .innerJoin(m, eq(m.productId, p.id))
      .where(and(eq(p.archived, false), isNotNull(p.mpn), isNotNull(p.price), isNotNull(m.ebayItemId)))
      .orderBy(sql`${lastCheck} asc nulls first`, sql`${p.price} desc nulls last`)
    return rows.filter((r) => usableMpn(r.mpn)).slice(0, opts.limit ?? 4500)
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

/**
 * המשלוח הזול לארה"ב מתוך מה שכבר נשמר מ-eBay (GetItem → products.shipping_costs, job:fetch-shipping).
 * null = לא נשמר / משלוח מחושב (Calculated) — אז שואלים את eBay.
 */
function storedUsShipping(c: Candidate): { cost: number; options: ShippingQuote[] } | null {
  const sc = c.shippingCosts
  if (!sc || (sc.currency && sc.currency !== 'USD')) return null
  const opts = (sc.domestic?.length ? sc.domestic : sc.us ? [sc.us] : [])
    .map((o) => ({ service: o.service, cost: o.free ? 0 : o.cost != null && Number.isFinite(Number(o.cost)) ? Number(o.cost) : null }))
    .filter((o): o is { service: string | null; cost: number } => o.cost != null)
    .sort((a, b) => a.cost - b.cost)
  if (!opts.length) return null
  return {
    cost: opts[0].cost,
    options: opts.map((o) => ({ service: o.service, cost: o.cost.toFixed(2), currency: 'USD', type: 'STORED', minDate: null, maxDate: null })),
  }
}

/** המשלוח שלנו מהבדיקה האחרונה לאותה מדינה, אם היא מ-14 הימים האחרונים */
type RecentShipping = Map<string, { cost: number; options: ShippingQuote[] }>
async function loadRecentShipping(productIds: string[]): Promise<RecentShipping> {
  if (!productIds.length) return new Map()
  const pc = schema.priceChecks
  const rows = await db
    .selectDistinctOn([pc.productId, pc.country], { productId: pc.productId, country: pc.country, cost: pc.ourShipping, options: pc.ourShippingOptions })
    .from(pc)
    .where(and(inArray(pc.productId, productIds), isNotNull(pc.ourShipping), sql`${pc.checkedAt} > now() - interval '14 days'`))
    .orderBy(pc.productId, pc.country, sql`${pc.checkedAt} desc`)
  return new Map(rows.map((r) => [`${r.productId}|${r.country}`, { cost: Number(r.cost), options: (r.options as ShippingQuote[] | null) ?? [] }]))
}

function classify(item: BrowseItem, ours: { mpn: string; brand: string | null }, group: ConditionGroup, manual: boolean | null): OfferRow {
  return { item, ...classifyOffer(item, ours, group, manual) }
}

/** המשלוח שלנו למדינה — מהמודעה החיה ב-eBay, כמו שהקונה רואה אותו */
async function ourShipping(
  c: Candidate,
  country: string,
  recent: RecentShipping = new Map(),
): Promise<{ cost: number | null; options: ShippingQuote[]; calls: number; reused?: boolean }> {
  // חיסכון בקריאות: המשלוח שלנו כמעט לא משתנה — קודם מה שכבר שמור במערכת
  const stored = country === 'US' ? storedUsShipping(c) : null
  if (stored) return { ...stored, calls: 0, reused: true }
  const prev = recent.get(`${c.productId}|${country}`)
  if (prev) return { ...prev, calls: 0, reused: true }
  if (c.ebayItemId) {
    const s = await getItemShipping(c.ebayItemId, { country })
    const first = s.options.find((o) => o.cost != null && o.currency === 'USD')
    return { cost: first ? Number(first.cost) : null, options: s.options, calls: 1 }
  }
  return { cost: null, options: [], calls: 0 }
}

/** החלטות ידניות (זה / לא אותו מוצר) — עוברות לבדיקות הבאות של אותה מודעה */
type Decisions = Map<string, boolean>
const decisionKey = (productId: string, ebayItemId: string) => `${productId}|${ebayItemId}`

async function loadDecisions(productIds: string[]): Promise<Decisions> {
  if (!productIds.length) return new Map()
  const rows = await db
    .selectDistinctOn([schema.competitorOffers.productId, schema.competitorOffers.ebayItemId], {
      productId: schema.competitorOffers.productId,
      ebayItemId: schema.competitorOffers.ebayItemId,
      manual: schema.competitorOffers.manualMatch,
    })
    .from(schema.competitorOffers)
    .where(and(inArray(schema.competitorOffers.productId, productIds), isNotNull(schema.competitorOffers.manualMatch)))
    .orderBy(schema.competitorOffers.productId, schema.competitorOffers.ebayItemId, sql`${schema.competitorOffers.id} desc`)
  return new Map(rows.map((r) => [decisionKey(r.productId, r.ebayItemId), r.manual!]))
}

async function checkOne(
  c: Candidate,
  country: string,
  excludeSellers: string[],
  decisions: Decisions = new Map(),
  recent: RecentShipping = new Map(),
): Promise<ProductCheck & { calls: number; reused: boolean }> {
  const mpn = usableMpn(c.mpn)!
  const group = conditionGroup(c.conditionId)
  const ourPrice = c.price != null ? Number(c.price) : null
  const base = { productId: c.productId, sku: c.sku, title: c.title, brand: c.brand, mpn, country, query: mpn, ourPrice, group }
  let calls = 0
  let ship: Awaited<ReturnType<typeof ourShipping>> = { cost: null, options: [], calls: 0 }

  try {
    ship = await ourShipping(c, country, recent).catch(() => ({ ...ship, calls: 1 })) // משלוח שלנו לא זמין → ממשיכים עם מחיר פריט בלבד
    calls += ship.calls
    const res = await searchCompetitors({ q: mpn, excludeSellers, country })
    calls += res.calls
    const offers = res.items
      // ביטחון כפול: גם אם הסינון של eBay לא תפס — לא משווים מול עצמנו
      .filter((i) => !i.seller || !excludeSellers.some((s) => s.toLowerCase() === i.seller!.toLowerCase()))
      .map((i) => {
        const manual = decisions.get(decisionKey(c.productId, i.itemId)) ?? null
        return { ...classify(i, { mpn, brand: c.brand }, group, manual), manual }
      })
    const cmp = compare(ourPrice, ship.cost, offers.filter((o) => o.compared).map((o) => o.item))
    return {
      ...base,
      ourShipping: ship.cost,
      ourShippingOptions: ship.options,
      totalResults: res.total,
      offers,
      ...cmp,
      error: null,
      calls,
      reused: !!ship.reused,
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
      reused: !!ship.reused,
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
        manualMatch: o.manual ?? null,
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

    const ids = candidates.map((c) => c.productId)
    const [decisions, recent] = await Promise.all([loadDecisions(ids), loadRecentShipping(ids)])
    const checks: ProductCheck[] = []
    let apiCalls = 0
    let shippingReused = 0
    let rateLimited = false
    const maxCalls = opts.maxCalls ?? (opts.all ? 4700 : Infinity)
    let budgetReached = false
    outer: for (const c of candidates) {
      for (const country of countries) {
        // עד 3 קריאות לבדיקה (חיפוש ארה"ב + חיפוש במדינה + המשלוח שלנו) — לא מתחילים בדיקה שעלולה לחרוג מהתקציב
        if (apiCalls + (country === 'US' ? 2 : 3) > maxCalls) {
          budgetReached = true
          break outer
        }
        if (apiCalls > 0) await new Promise((r) => setTimeout(r, DELAY_MS))
        const { calls, reused, ...r } = await checkOne(c, country, excludeSellers, decisions, recent)
        apiCalls += calls
        if (reused) shippingReused++
        // חריגה ממכסת eBay (5,000 ביום ל-Browse) — עוצרים במקום להמשיך להיכשל על כל מוצר
        if (r.error && /rate.?limit|too many requests|request limit|call limit|HTTP 429|exceeded/i.test(r.error)) {
          rateLimited = true
          break outer
        }
        checks.push(r)
        if (!dryRun) {
          await saveCheck(runId, r)
          // ריצה גדולה: אחרי השמירה משאירים בזיכרון רק את מה שנכנס להשוואה
          if (opts.lean) r.offers = r.offers.filter((o) => o.compared)
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
      products: new Set(checks.map((c) => c.productId)).size,
      countries,
      apiCalls,
      shippingReused,
      rateLimited,
      budgetReached,
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
        success: result.errors === 0 && !rateLimited,
        durationMs: Date.now() - started,
        details: {
          products: result.products,
          countries,
          apiCalls: result.apiCalls,
          shippingReused,
          rateLimited,
          budgetReached,
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

/**
 * אחרי החלטה ידנית על מודעה: שומר את ההחלטה ומחשב מחדש את ההשוואה של הבדיקה (בלי קריאה ל-eBay).
 * manual: true = אותו מוצר · false = לא אותו מוצר · null = חזרה לכללים.
 */
export async function setOfferDecision(offerId: number, manual: boolean | null): Promise<{ checkId: string } | null> {
  return db.transaction(async (tx) => {
    const [offer] = await tx.select({ checkId: schema.competitorOffers.checkId }).from(schema.competitorOffers).where(eq(schema.competitorOffers.id, offerId))
    if (!offer) return null
    const [check] = await tx
      .select({
        id: schema.priceChecks.id,
        ourPrice: schema.priceChecks.ourPrice,
        ourShipping: schema.priceChecks.ourShipping,
        group: schema.priceChecks.conditionGroup,
        mpn: schema.priceChecks.query,
        brand: schema.products.brand,
      })
      .from(schema.priceChecks)
      .innerJoin(schema.products, eq(schema.products.id, schema.priceChecks.productId))
      .where(eq(schema.priceChecks.id, offer.checkId))
      .for('update', { of: schema.priceChecks })
    await tx.update(schema.competitorOffers).set({ manualMatch: manual }).where(eq(schema.competitorOffers.id, offerId))

    const offers = await tx.select().from(schema.competitorOffers).where(eq(schema.competitorOffers.checkId, check.id))
    const kept: { price: string | null; shipping: string | null }[] = []
    for (const o of offers) {
      const k = classifyOffer(
        { title: o.title, conditionId: o.conditionId, price: o.price, currency: o.currency, shipping: o.shipping, buyingOptions: o.buyingOptions },
        { mpn: check.mpn, brand: check.brand },
        check.group as ConditionGroup,
        o.manualMatch,
      )
      if (k.compared !== o.compared) await tx.update(schema.competitorOffers).set({ compared: k.compared }).where(eq(schema.competitorOffers.id, o.id))
      if (k.compared) kept.push(o)
    }
    const num = (v: number | null) => (v == null ? null : String(v))
    const cmp = compare(check.ourPrice != null ? Number(check.ourPrice) : null, check.ourShipping != null ? Number(check.ourShipping) : null, kept)
    await tx
      .update(schema.priceChecks)
      .set({
        compareCount: cmp.stats.count,
        minPrice: num(cmp.stats.min),
        medianPrice: num(cmp.stats.median),
        maxPrice: num(cmp.stats.max),
        vsMedianPct: num(cmp.stats.vsMedianPct),
        vsMinPct: num(cmp.stats.vsMinPct),
        position: cmp.stats.position,
        basis: cmp.basis,
        itemStats: cmp.item,
      })
      .where(eq(schema.priceChecks.id, check.id))
    return { checkId: check.id }
  })
}
