import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { googleEnvStatus } from '@/lib/google/config'
import { missingWooEnv, wooBaseUrl } from '@/lib/woo/config'
import { buildInsights, type Insight } from './insights'
import { daysAgo } from './paths'

// הדוח של מסך התובנות: מדדים לתקופה מול התקופה הקודמת, פילוחים, טבלאות ותובנות.
// קורא רק מ-Postgres — הנתונים נמשכים מגוגל ע"י jobs/fetch-analytics.ts.

export const PERIODS = [7, 28, 90] as const
export type PeriodDays = (typeof PERIODS)[number]

export interface Range {
  from: string
  to: string
}

export function periodRanges(days: number, now = new Date()): { cur: Range; prev: Range } {
  return {
    cur: { from: daysAgo(days - 1, now), to: daysAgo(0, now) },
    prev: { from: daysAgo(2 * days - 1, now), to: daysAgo(days, now) },
  }
}

const q = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[]
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

// ── חיפוש (Search Console) ───────────────────────────────────────────────────

export interface SearchTotals {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

async function searchTotals(r: Range): Promise<SearchTotals> {
  const [row] = await q<{ clicks: string; impressions: string; pos: string }>(sql`
    select coalesce(sum(clicks),0) clicks, coalesce(sum(impressions),0) impressions, coalesce(sum(position_sum),0) pos
    from gsc_pages_daily where date between ${r.from} and ${r.to}`)
  const clicks = num(row?.clicks)
  const impressions = num(row?.impressions)
  return { clicks, impressions, ctr: ratio(clicks, impressions), position: ratio(num(row?.pos), impressions) }
}

export interface PageStat {
  page: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
  prevClicks: number
  prevImpressions: number
  views: number
  product: CatalogRef | null
}

export interface QueryStat {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
  prevImpressions: number
}

// ── אתר (GA4) ────────────────────────────────────────────────────────────────

export interface SiteTotals {
  users: number
  newUsers: number
  returningUsers: number
  sessions: number
  engagedSessions: number
  engagementRate: number | null
  bounceRate: number | null
  avgEngagementSec: number | null
  pageViews: number
  pagesPerSession: number | null
  addToCarts: number
  checkouts: number
  purchases: number
  revenue: number
  conversionRate: number | null
  aov: number | null
  revenuePerSession: number | null
  cartAbandonment: number | null
  checkoutAbandonment: number | null
  adCost: number | null
  adClicks: number | null
}

async function siteTotals(r: Range): Promise<SiteTotals & { days: number }> {
  const [row] = await q<Record<string, string | null>>(sql`
    select count(*) days, coalesce(sum(users),0) users, coalesce(sum(new_users),0) new_users, coalesce(sum(sessions),0) sessions,
      coalesce(sum(engaged_sessions),0) engaged, coalesce(sum(engagement_seconds),0) eng_sec, coalesce(sum(page_views),0) views,
      coalesce(sum(add_to_carts),0) carts, coalesce(sum(checkouts),0) checkouts, coalesce(sum(purchases),0) purchases,
      coalesce(sum(revenue),0) revenue, sum(ad_cost) ad_cost, sum(ad_clicks) ad_clicks
    from ga_site_daily where date between ${r.from} and ${r.to}`)
  const sessions = num(row?.sessions)
  const users = num(row?.users)
  const newUsers = num(row?.new_users)
  const engaged = num(row?.engaged)
  const purchases = num(row?.purchases)
  const revenue = num(row?.revenue)
  const carts = num(row?.carts)
  const checkouts = num(row?.checkouts)
  const engagementRate = ratio(engaged, sessions)
  return {
    days: num(row?.days),
    users,
    newUsers,
    // משתמשים (סכום יומי) הוא קירוב — GA סופר משתמש ייחודי לכל יום בנפרד
    returningUsers: Math.max(0, users - newUsers),
    sessions,
    engagedSessions: engaged,
    engagementRate,
    bounceRate: engagementRate === null ? null : 1 - engagementRate,
    avgEngagementSec: ratio(num(row?.eng_sec), users),
    pageViews: num(row?.views),
    pagesPerSession: ratio(num(row?.views), sessions),
    addToCarts: carts,
    checkouts,
    purchases,
    revenue,
    conversionRate: ratio(purchases, sessions),
    aov: ratio(revenue, purchases),
    revenuePerSession: ratio(revenue, sessions),
    cartAbandonment: carts > 0 ? Math.max(0, 1 - purchases / carts) : null,
    checkoutAbandonment: checkouts > 0 ? Math.max(0, 1 - purchases / checkouts) : null,
    adCost: row?.ad_cost === null || row?.ad_cost === undefined ? null : num(row.ad_cost),
    adClicks: row?.ad_clicks === null || row?.ad_clicks === undefined ? null : num(row.ad_clicks),
  }
}

export interface BreakdownRow {
  value: string
  users: number
  sessions: number
  engagedSessions: number
  engagementRate: number | null
  purchases: number
  revenue: number
  conversionRate: number | null
  share: number | null
  prevSessions: number
}

async function breakdown(dimension: 'channel' | 'device' | 'country', cur: Range, prev: Range, limit = 12): Promise<BreakdownRow[]> {
  const rows = await q<Record<string, string>>(sql`
    select value,
      coalesce(sum(users) filter (where date between ${cur.from} and ${cur.to}),0) users,
      coalesce(sum(sessions) filter (where date between ${cur.from} and ${cur.to}),0) sessions,
      coalesce(sum(engaged_sessions) filter (where date between ${cur.from} and ${cur.to}),0) engaged,
      coalesce(sum(purchases) filter (where date between ${cur.from} and ${cur.to}),0) purchases,
      coalesce(sum(revenue) filter (where date between ${cur.from} and ${cur.to}),0) revenue,
      coalesce(sum(sessions) filter (where date between ${prev.from} and ${prev.to}),0) prev_sessions
    from ga_breakdown_daily where dimension = ${dimension} and date between ${prev.from} and ${cur.to}
    group by value order by 3 desc limit ${limit}`)
  const total = rows.reduce((s, r) => s + num(r.sessions), 0)
  return rows
    .map((r) => {
      const sessions = num(r.sessions)
      return {
        value: r.value,
        users: num(r.users),
        sessions,
        engagedSessions: num(r.engaged),
        engagementRate: ratio(num(r.engaged), sessions),
        purchases: num(r.purchases),
        revenue: num(r.revenue),
        conversionRate: ratio(num(r.purchases), sessions),
        share: ratio(sessions, total),
        prevSessions: num(r.prev_sessions),
      }
    })
    .filter((r) => r.sessions > 0 || r.prevSessions > 0)
}

// ── מוצרים ───────────────────────────────────────────────────────────────────

export interface CatalogRef {
  wooProductId: number
  name: string
  sku: string | null
  status: string
  stockStatus: string | null
  stockQuantity: number | null
  price: number | null
  path: string | null
  productId: string | null
  available: number | null
  wooCreatedAt: string | null
}

async function catalog(): Promise<CatalogRef[]> {
  const rows = await q<Record<string, string | number | null>>(sql`
    select c.woo_product_id, c.name, c.sku, c.status, c.stock_status, c.stock_quantity, c.price, c.path, c.woo_created_at,
      m.product_id, (select coalesce(sum(delta),0)::int from stock_ledger l where l.product_id = m.product_id) available
    from woo_catalog c left join channel_mappings m on m.sku = c.sku`)
  return rows.map((r) => ({
    wooProductId: num(r.woo_product_id),
    name: String(r.name),
    sku: (r.sku as string) || null,
    status: String(r.status),
    stockStatus: (r.stock_status as string) ?? null,
    stockQuantity: r.stock_quantity === null ? null : num(r.stock_quantity),
    price: r.price === null ? null : num(r.price),
    path: (r.path as string) ?? null,
    productId: (r.product_id as string) ?? null,
    available: r.product_id ? num(r.available) : null,
    wooCreatedAt: r.woo_created_at ? new Date(r.woo_created_at as string).toISOString() : null,
  }))
}

export interface ItemStat {
  itemId: string
  name: string
  viewed: number
  addedToCart: number
  purchased: number
  revenue: number
  cartRate: number | null
  buyRate: number | null
  product: CatalogRef | null
}

// ── מכירות eBay (מה-DB שלנו) ──────────────────────────────────────────────────

export interface EbaySales {
  orders: number
  units: number
  revenue: number
}

async function ebaySales(r: Range): Promise<EbaySales> {
  const [row] = await q<Record<string, string>>(sql`
    select count(distinct po.external_order_id) orders, coalesce(sum(po.quantity),0) units, coalesce(sum(po.line_total) filter (where coalesce(po.currency,'USD')='USD'),0) revenue
    from processed_orders po left join orders o on o.channel = po.channel and o.external_order_id = po.external_order_id
    where po.channel = 'ebay' and po.status <> 'cancelled' and coalesce(o.state::text,'paid') not in ('cancelled','refunded')
      and (po.order_created_at at time zone 'UTC')::date between ${r.from}::date and ${r.to}::date`)
  return { orders: num(row?.orders), units: num(row?.units), revenue: num(row?.revenue) }
}

export interface EbaySeller {
  productId: string
  title: string
  sku: string
  units: number
  revenue: number
  available: number
}

/** מוצרים שנמכרו ב-eBay ב-90 הימים האחרונים, עם מלאי, ושלא נמצאים בחנות */
async function ebaySellersNotInStore(): Promise<EbaySeller[]> {
  const rows = await q<Record<string, string>>(sql`
    select p.id, p.title, m.sku, sum(po.quantity) units, coalesce(sum(po.line_total),0) revenue,
      (select coalesce(sum(delta),0) from stock_ledger l where l.product_id = p.id) available
    from processed_orders po join products p on p.id = po.product_id join channel_mappings m on m.product_id = p.id
    where po.channel = 'ebay' and po.status <> 'cancelled' and po.order_created_at >= now() - interval '90 days'
      and m.woo_product_id is null and not exists (select 1 from woo_catalog c where c.sku = m.sku)
    group by p.id, p.title, m.sku having sum(po.quantity) >= 1
    order by 4 desc, 5 desc limit 50`)
  return rows
    .map((r) => ({ productId: r.id, title: r.title, sku: r.sku, units: num(r.units), revenue: num(r.revenue), available: num(r.available) }))
    .filter((r) => r.available > 0)
}

// ── הוצאות שיווק ─────────────────────────────────────────────────────────────

export interface SpendRow {
  id: number
  month: string
  channel: string
  amount: number
  note: string | null
}

export async function listSpend(): Promise<SpendRow[]> {
  const rows = await q<Record<string, string | number | null>>(sql`select id, month, channel, amount, note from marketing_spend order by month desc, channel`)
  return rows.map((r) => ({ id: num(r.id), month: String(r.month), channel: String(r.channel), amount: num(r.amount), note: (r.note as string) ?? null }))
}

/** הוצאה חודשית מחולקת לפי ימים — החלק של החודש שנופל בתקופה */
export function spendInRange(rows: SpendRow[], r: Range): number {
  let total = 0
  for (const s of rows) {
    const [y, m] = s.month.split('-').map(Number)
    const first = Date.UTC(y, m - 1, 1)
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const last = first + (daysInMonth - 1) * 86400_000
    const from = Math.max(first, Date.parse(r.from + 'T00:00:00Z'))
    const to = Math.min(last, Date.parse(r.to + 'T00:00:00Z'))
    if (to >= from) total += (s.amount * ((to - from) / 86400_000 + 1)) / daysInMonth
  }
  return Math.round(total * 100) / 100
}

// ── הדוח ─────────────────────────────────────────────────────────────────────

export interface DailyPoint {
  date: string
  clicks: number
  impressions: number
  sessions: number
  purchases: number
  revenue: number
}

export async function analyticsReport(days: number) {
  const { cur, prev } = periodRanges(days)
  const env = googleEnvStatus()

  const [searchCur, searchPrev, siteCur, sitePrev, ebayCur, ebayPrev, cat, spend, coverage] = await Promise.all([
    searchTotals(cur),
    searchTotals(prev),
    siteTotals(cur),
    siteTotals(prev),
    ebaySales(cur),
    ebaySales(prev),
    catalog(),
    listSpend(),
    q<Record<string, string | null>>(sql`
      select (select min(date) from gsc_pages_daily) gsc_from, (select max(date) from gsc_pages_daily) gsc_to,
        (select min(date) from ga_site_daily) ga_from, (select max(date) from ga_site_daily) ga_to,
        (select max(fetched_at) from woo_catalog) catalog_at, (select count(*) from woo_catalog) catalog_n,
        (select count(*) from ga_items_daily) items_n,
        (select max(created_at) from sync_log where job = 'analytics') last_fetch_at`),
  ])

  const byPath = new Map(cat.filter((c) => c.path).map((c) => [c.path!, c]))
  const byItem = new Map<string, CatalogRef>()
  for (const c of cat) {
    byItem.set(String(c.wooProductId), c)
    if (c.sku) byItem.set(c.sku.toLowerCase(), c)
  }

  const pageRows = await q<Record<string, string>>(sql`
    with g as (
      select page,
        coalesce(sum(clicks) filter (where date between ${cur.from} and ${cur.to}),0) clicks,
        coalesce(sum(impressions) filter (where date between ${cur.from} and ${cur.to}),0) impressions,
        coalesce(sum(position_sum) filter (where date between ${cur.from} and ${cur.to}),0) pos,
        coalesce(sum(clicks) filter (where date between ${prev.from} and ${prev.to}),0) prev_clicks,
        coalesce(sum(impressions) filter (where date between ${prev.from} and ${prev.to}),0) prev_impressions
      from gsc_pages_daily where date between ${prev.from} and ${cur.to} group by page),
    v as (select page, sum(views) views from ga_pages_daily where date between ${cur.from} and ${cur.to} group by page)
    select coalesce(g.page, v.page) page, coalesce(g.clicks,0) clicks, coalesce(g.impressions,0) impressions, coalesce(g.pos,0) pos,
      coalesce(g.prev_clicks,0) prev_clicks, coalesce(g.prev_impressions,0) prev_impressions, coalesce(v.views,0) views
    from g full join v on v.page = g.page
    order by 2 desc, 3 desc, 7 desc limit 1000`)
  const pages: PageStat[] = pageRows.map((r) => {
    const impressions = num(r.impressions)
    return {
      page: r.page,
      clicks: num(r.clicks),
      impressions,
      ctr: ratio(num(r.clicks), impressions),
      position: ratio(num(r.pos), impressions),
      prevClicks: num(r.prev_clicks),
      prevImpressions: num(r.prev_impressions),
      views: num(r.views),
      product: byPath.get(r.page) ?? null,
    }
  })

  const queryRows = await q<Record<string, string>>(sql`
    with c as (
      select query, page, sum(clicks) clicks, sum(impressions) impressions, sum(position_sum) pos
      from gsc_queries_daily where date between ${cur.from} and ${cur.to} group by query, page),
    top as (select distinct on (query) query, page from c order by query, impressions desc),
    agg as (select query, sum(clicks) clicks, sum(impressions) impressions, sum(pos) pos from c group by query),
    p as (select query, sum(impressions) prev_impressions from gsc_queries_daily where date between ${prev.from} and ${prev.to} group by query)
    select agg.query, top.page, agg.clicks, agg.impressions, agg.pos, coalesce(p.prev_impressions,0) prev_impressions
    from agg join top using (query) left join p using (query)
    order by agg.impressions desc limit 1000`)
  const queries: QueryStat[] = queryRows.map((r) => ({
    query: r.query,
    page: r.page,
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: ratio(num(r.clicks), num(r.impressions)),
    position: ratio(num(r.pos), num(r.impressions)),
    prevImpressions: num(r.prev_impressions),
  }))

  const itemRows = await q<Record<string, string>>(sql`
    select item_id, max(item_name) item_name, sum(viewed) viewed, sum(added_to_cart) added, sum(purchased) purchased, sum(revenue) revenue
    from ga_items_daily where date between ${cur.from} and ${cur.to} group by item_id order by 3 desc, 6 desc limit 500`)
  const items: ItemStat[] = itemRows.map((r) => ({
    itemId: r.item_id,
    name: r.item_name,
    viewed: num(r.viewed),
    addedToCart: num(r.added),
    purchased: num(r.purchased),
    revenue: num(r.revenue),
    cartRate: ratio(num(r.added), num(r.viewed)),
    buyRate: ratio(num(r.purchased), num(r.viewed)),
    product: byItem.get(r.item_id.toLowerCase()) ?? null,
  }))

  const daily = await q<Record<string, string>>(sql`
    with d as (select generate_series(${cur.from}::date, ${cur.to}::date, '1 day')::date::text date)
    select d.date, coalesce(g.clicks,0) clicks, coalesce(g.impressions,0) impressions, coalesce(s.sessions,0) sessions, coalesce(s.purchases,0) purchases, coalesce(s.revenue,0) revenue
    from d
    left join (select date, sum(clicks) clicks, sum(impressions) impressions from gsc_pages_daily where date between ${cur.from} and ${cur.to} group by date) g using (date)
    left join ga_site_daily s using (date)
    order by d.date`)

  const [channels, devices, countries, sellers] = await Promise.all([breakdown('channel', cur, prev), breakdown('device', cur, prev), breakdown('country', cur, prev, 10), ebaySellersNotInStore()])

  const manualSpend = spendInRange(spend, cur)
  const manualSpendPrev = spendInRange(spend, prev)
  const marketing = (site: SiteTotals, manual: number) => {
    const total = manual + (site.adCost ?? 0)
    return {
      manualSpend: manual,
      adCost: site.adCost,
      totalSpend: total,
      roas: ratio(site.revenue, total),
      roi: total > 0 ? (site.revenue - total) / total : null,
      cpa: ratio(total, site.purchases),
      cpc: site.adCost !== null && site.adClicks ? site.adCost / site.adClicks : null,
    }
  }

  const c = coverage[0] ?? {}
  const report = {
    days,
    period: cur,
    prevPeriod: prev,
    setup: {
      gsc: env.gsc,
      ga4: env.ga4,
      woo: missingWooEnv().length === 0,
      storeUrl: wooBaseUrl(),
      gscRange: c.gsc_from ? { from: c.gsc_from, to: c.gsc_to } : null,
      gaRange: c.ga_from ? { from: c.ga_from, to: c.ga_to } : null,
      catalogAt: c.catalog_at ? new Date(c.catalog_at).toISOString() : null,
      catalogProducts: num(c.catalog_n),
      ecommerceTracking: num(c.items_n) > 0,
      lastFetchAt: c.last_fetch_at ? new Date(c.last_fetch_at).toISOString() : null,
      adsLinked: siteCur.adCost !== null,
    },
    search: { cur: searchCur, prev: searchPrev },
    site: { cur: siteCur, prev: sitePrev },
    ebay: { cur: ebayCur, prev: ebayPrev },
    marketing: { cur: marketing(siteCur, manualSpend), prev: marketing(sitePrev, manualSpendPrev) },
    daily: daily.map((r) => ({ date: r.date, clicks: num(r.clicks), impressions: num(r.impressions), sessions: num(r.sessions), purchases: num(r.purchases), revenue: num(r.revenue) })) as DailyPoint[],
    channels,
    devices,
    countries,
    pages: pages.slice(0, 100),
    queries: queries.slice(0, 100),
    items: items.slice(0, 100),
    spend,
    insights: [] as Insight[],
  }
  report.insights = buildInsights({ ...report, allPages: pages, allQueries: queries, allItems: items, catalog: cat, ebaySellers: sellers })
  return report
}

export type AnalyticsReport = Awaited<ReturnType<typeof analyticsReport>>
