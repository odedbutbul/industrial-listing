import { randomUUID } from 'node:crypto'
import { and, gte, lte, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { db, schema } from '@/lib/db/client'
import { ga4Report } from '@/lib/google/ga4'
import { googleEnvStatus } from '@/lib/google/config'
import { gscQuery } from '@/lib/google/gsc'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import type { ImportProgress } from '@/lib/sync/import-ebay'
import { missingWooEnv } from '@/lib/woo/config'
import { wooGet } from '@/lib/woo/client'
import { daysAgo, normalizePath } from './paths'

// משיכת נתוני אנליטיקס ל-Postgres: Search Console, GA4 ותמונת מצב של מוצרי החנות.
// הכל קריאה בלבד מול גוגל ומול החנות. כל מקור נמשך בנפרד — כשל באחד לא עוצר את האחרים, ונרשם ב-sync_log.
// כל טווח נמחק ונכתב מחדש בטרנזקציה (גוגל משלים ומתקן נתונים של הימים האחרונים).

export const ANALYTICS_JOB = 'analytics'
/** ריצה ראשונה: כמה ימים אחורה. Search Console שומר 16 חודשים. */
export const FIRST_RUN_DAYS = 90
/** ריצה רגילה: הימים האחרונים שנמשכים שוב */
export const DAILY_DAYS = 5

export interface SourceResult {
  source: 'gsc' | 'ga4' | 'woo_catalog'
  ok: boolean
  skipped?: string
  rows?: Record<string, number>
  error?: string
}

export interface AnalyticsFetchResult {
  from: string
  to: string
  sources: SourceResult[]
}

type Progress = (p: ImportProgress) => void

export async function fetchAnalytics(opts: { days?: number; onProgress?: Progress } = {}): Promise<AnalyticsFetchResult> {
  return withJobLock(ANALYTICS_JOB, async () => {
    const runId = randomUUID()
    const env = googleEnvStatus()
    const hasData = (await db.execute<{ n: number }>(sql`select (select count(*) from gsc_pages_daily) + (select count(*) from ga_site_daily) as n`)).rows[0]
    const days = opts.days ?? (Number(hasData?.n ?? 0) > 0 ? DAILY_DAYS : FIRST_RUN_DAYS)
    const from = daysAgo(days)
    const to = daysAgo(0)
    const sources: SourceResult[] = []
    const step = (done: number) => opts.onProgress?.({ phase: 'pages', done, total: 3 })

    step(0)
    sources.push(await runSource(runId, 'gsc', env.gsc ? null : 'Search Console לא הוגדר', () => fetchGsc(from, to)))
    step(1)
    sources.push(await runSource(runId, 'ga4', env.ga4 ? null : 'Google Analytics לא הוגדר', () => fetchGa4(from, to)))
    step(2)
    sources.push(await runSource(runId, 'woo_catalog', missingWooEnv().length ? 'WooCommerce לא הוגדר' : null, fetchWooCatalog))
    step(3)
    return { from, to, sources }
  })
}

async function runSource(runId: string, source: SourceResult['source'], skipped: string | null, fn: () => Promise<Record<string, number>>): Promise<SourceResult> {
  if (skipped) return { source, ok: true, skipped }
  const started = Date.now()
  try {
    const rows = await fn()
    await writeSyncLog({ runId, job: ANALYTICS_JOB, action: `${source}_fetch`, success: true, details: rows, durationMs: Date.now() - started })
    return { source, ok: true, rows }
  } catch (e) {
    const error = shortError(e)
    await writeSyncLog({ runId, job: ANALYTICS_JOB, action: `${source}_fetch`, success: false, error, durationMs: Date.now() - started })
    return { source, ok: false, error }
  }
}

/** שגיאת DB של drizzle כוללת את כל השאילתה והפרמטרים — שומרים רק את הסיבה, מקוצרת */
function shortError(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : null
  const msg = cause ?? (e instanceof Error ? e.message : String(e))
  return msg.length > 500 ? msg.slice(0, 500) + '…' : msg
}

// ── Search Console ───────────────────────────────────────────────────────────

async function fetchGsc(from: string, to: string) {
  const [pages, queries] = await Promise.all([
    gscQuery({ startDate: from, endDate: to, dimensions: ['date', 'page'] }),
    gscQuery({ startDate: from, endDate: to, dimensions: ['date', 'query', 'page'] }),
  ])
  const pageRows = merge(
    pages.map((r) => ({ date: r.keys[0], page: normalizePath(r.keys[1]), clicks: r.clicks, impressions: r.impressions, positionSum: r.position * r.impressions })),
    (r) => `${r.date}|${r.page}`,
  )
  const queryRows = merge(
    queries.map((r) => ({ date: r.keys[0], query: r.keys[1].trim().toLowerCase(), page: normalizePath(r.keys[2]), clicks: r.clicks, impressions: r.impressions, positionSum: r.position * r.impressions })),
    (r) => `${r.date}|${r.query}|${r.page}`,
  )
  await db.transaction(async (tx) => {
    await replaceRange(tx, schema.gscPagesDaily, from, to, pageRows.map((r) => ({ ...r, positionSum: r.positionSum.toFixed(2) })))
    await replaceRange(tx, schema.gscQueriesDaily, from, to, queryRows.map((r) => ({ ...r, positionSum: r.positionSum.toFixed(2) })))
  })
  return { pages: pageRows.length, queries: queryRows.length }
}

/** כמה כתובות שונות (http/https, query string) מתנרמלות לאותו נתיב — מסכמים */
function merge<T extends { clicks: number; impressions: number; positionSum: number }>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>()
  for (const r of rows) {
    const k = key(r)
    const e = m.get(k)
    if (!e) m.set(k, { ...r })
    else {
      e.clicks += r.clicks
      e.impressions += r.impressions
      e.positionSum += r.positionSum
    }
  }
  return Array.from(m.values())
}

// ── GA4 ──────────────────────────────────────────────────────────────────────

const n = (v: string | undefined) => (v ? Number(v) || 0 : 0)
const int = (v: string | undefined) => Math.round(n(v))

async function fetchGa4(from: string, to: string) {
  const base = { startDate: from, endDate: to }
  const [site, pages, items, ...breakdowns] = await Promise.all([
    ga4Report({ ...base, dimensions: ['date'], metrics: ['totalUsers', 'newUsers', 'sessions', 'engagedSessions', 'userEngagementDuration', 'screenPageViews', 'addToCarts', 'checkouts', 'ecommercePurchases', 'purchaseRevenue'] }),
    ga4Report({ ...base, dimensions: ['date', 'pagePath'], metrics: ['screenPageViews', 'totalUsers', 'userEngagementDuration'] }),
    ga4Report({ ...base, dimensions: ['date', 'itemId', 'itemName'], metrics: ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased', 'itemRevenue'] }),
    ...(
      [
        ['channel', 'sessionDefaultChannelGroup'],
        ['device', 'deviceCategory'],
        ['country', 'country'],
      ] as const
    ).map(([dimension, name]) =>
      ga4Report({ ...base, dimensions: ['date', name], metrics: ['totalUsers', 'sessions', 'engagedSessions', 'ecommercePurchases', 'purchaseRevenue'] }).then((rows) => rows.map((r) => ({ dimension, value: r[name] || '(not set)', r }))),
    ),
  ])
  // עלות פרסום קיימת רק כש-Google Ads מקושר ל-GA. בלי קישור — null, לא 0.
  const ads = await ga4Report({ ...base, dimensions: ['date'], metrics: ['advertiserAdCost', 'advertiserAdClicks'] }).catch(() => null)
  const adByDate = new Map((ads ?? []).map((r) => [r.date, r]))

  const siteRows = site.map((r) => {
    const a = adByDate.get(r.date)
    return {
      date: r.date,
      users: int(r.totalUsers),
      newUsers: int(r.newUsers),
      sessions: int(r.sessions),
      engagedSessions: int(r.engagedSessions),
      engagementSeconds: n(r.userEngagementDuration).toFixed(2),
      pageViews: int(r.screenPageViews),
      addToCarts: int(r.addToCarts),
      checkouts: int(r.checkouts),
      purchases: int(r.ecommercePurchases),
      revenue: n(r.purchaseRevenue).toFixed(2),
      adCost: ads ? n(a?.advertiserAdCost).toFixed(2) : null,
      adClicks: ads ? int(a?.advertiserAdClicks) : null,
    }
  })

  const pageMap = new Map<string, { date: string; page: string; views: number; users: number; engagementSeconds: number }>()
  for (const r of pages) {
    const page = normalizePath(r.pagePath)
    const k = `${r.date}|${page}`
    const e = pageMap.get(k) ?? { date: r.date, page, views: 0, users: 0, engagementSeconds: 0 }
    e.views += int(r.screenPageViews)
    e.users += int(r.totalUsers)
    e.engagementSeconds += n(r.userEngagementDuration)
    pageMap.set(k, e)
  }
  const pageRows = Array.from(pageMap.values()).map((r) => ({ ...r, engagementSeconds: r.engagementSeconds.toFixed(2) }))

  const itemRows = items
    .filter((r) => r.itemId && r.itemId !== '(not set)')
    .map((r) => ({ date: r.date, itemId: r.itemId, itemName: r.itemName || r.itemId, viewed: int(r.itemsViewed), addedToCart: int(r.itemsAddedToCart), purchased: int(r.itemsPurchased), revenue: n(r.itemRevenue).toFixed(2) }))

  const breakdownRows = breakdowns.flat().map(({ dimension, value, r }) => ({
    date: r.date,
    dimension,
    value,
    users: int(r.totalUsers),
    sessions: int(r.sessions),
    engagedSessions: int(r.engagedSessions),
    purchases: int(r.ecommercePurchases),
    revenue: n(r.purchaseRevenue).toFixed(2),
  }))

  await db.transaction(async (tx) => {
    await replaceRange(tx, schema.gaSiteDaily, from, to, siteRows)
    await replaceRange(tx, schema.gaPagesDaily, from, to, pageRows)
    await replaceRange(tx, schema.gaItemsDaily, from, to, itemRows)
    await replaceRange(tx, schema.gaBreakdownDaily, from, to, breakdownRows)
  })
  return { days: siteRows.length, pages: pageRows.length, items: itemRows.length, breakdown: breakdownRows.length, adsLinked: ads ? 1 : 0 }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function replaceRange(tx: Tx, table: PgTable, from: string, to: string, rows: Record<string, unknown>[]) {
  const dateCol = (table as unknown as { date: Parameters<typeof gte>[0] }).date
  await tx.delete(table).where(and(gte(dateCol, from), lte(dateCol, to)))
  // רק שורות בטווח שנמחק — שורה מחוץ לטווח הייתה מתנגשת בנתונים קיימים
  rows = rows.filter((r) => typeof r.date === 'string' && r.date >= from && r.date <= to)
  for (let i = 0; i < rows.length; i += 2000) await tx.insert(table).values(rows.slice(i, i + 2000) as never)
}

// ── מוצרי החנות ──────────────────────────────────────────────────────────────

interface WooCatalogItem {
  id: number
  sku: string
  name: string
  permalink: string
  status: string
  stock_status: string | null
  stock_quantity: number | null
  price: string
  date_created_gmt: string | null
}

async function fetchWooCatalog() {
  const all: WooCatalogItem[] = []
  for (let page = 1; page <= 200; page++) {
    const r = await wooGet<WooCatalogItem[]>('products', { per_page: 100, page, status: 'any', _fields: 'id,sku,name,permalink,status,stock_status,stock_quantity,price,date_created_gmt' })
    all.push(...r.data)
    if (!r.totalPages || page >= r.totalPages) break
  }
  const rows = all.map((p) => ({
    wooProductId: p.id,
    sku: p.sku || null,
    name: p.name,
    // טיוטה מקבלת permalink עם ?p= — אין לה כתובת ציבורית
    path: p.permalink && !p.permalink.includes('?') ? normalizePath(p.permalink) : null,
    status: p.status,
    stockStatus: p.stock_status,
    stockQuantity: p.stock_quantity,
    price: p.price ? String(Number(p.price).toFixed(2)) : null,
    wooCreatedAt: p.date_created_gmt ? new Date(p.date_created_gmt + 'Z') : null,
    fetchedAt: new Date(),
  }))
  await db.transaction(async (tx) => {
    await tx.delete(schema.wooCatalog)
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(schema.wooCatalog).values(rows.slice(i, i + 1000))
  })
  return { products: rows.length, published: rows.filter((r) => r.status === 'publish').length }
}
