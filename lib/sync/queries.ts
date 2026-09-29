import { and, desc, eq, gte, ilike, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getConnectionStatus } from '@/lib/ebay/auth'
import { missingEbayEnv } from '@/lib/ebay/config'
import { ebayWritesEnabled } from '@/lib/ebay/guard'
import { IMPORT_JOB } from './import-ebay'

// שאילתות קריאה למסכי /sync. קוראות רק מ-Postgres — שום קריאה ל-eBay.

const { products, channelMappings, stockLedger, syncLog } = schema

/** מלאי זמין לכל מוצר = SUM(delta) ב-ledger */
const availableSq = db
  .select({
    productId: stockLedger.productId,
    available: sql<number>`coalesce(sum(${stockLedger.delta}), 0)::int`.as('available'),
  })
  .from(stockLedger)
  .groupBy(stockLedger.productId)
  .as('avail')

const availableExpr = sql<number>`coalesce(${availableSq.available}, 0)::int`

export type ProductFilter = 'all' | 'in_stock' | 'sold_out' | 'mismatch' | 'no_woo'

function filterWhere(filter: ProductFilter): SQL | undefined {
  switch (filter) {
    case 'in_stock':
      return sql`${availableExpr} > 0`
    case 'sold_out':
      return sql`${availableExpr} <= 0`
    case 'mismatch':
      return sql`${channelMappings.lastEbayQty} is not null and ${channelMappings.lastEbayQty} <> ${availableExpr}`
    case 'no_woo':
      return sql`${channelMappings.wooProductId} is null`
    default:
      return undefined
  }
}

export async function getOverview() {
  const [counts] = await db
    .select({
      products: sql<number>`count(*)::int`,
      inStock: sql<number>`count(*) filter (where ${availableExpr} > 0)::int`,
      soldOut: sql<number>`count(*) filter (where ${availableExpr} <= 0)::int`,
      units: sql<number>`coalesce(sum(greatest(${availableExpr}, 0)), 0)::int`,
      mismatches: sql<number>`count(*) filter (where ${channelMappings.lastEbayQty} is not null and ${channelMappings.lastEbayQty} <> ${availableExpr})::int`,
      wooLinked: sql<number>`count(*) filter (where ${channelMappings.wooProductId} is not null)::int`,
    })
    .from(products)
    .innerJoin(channelMappings, eq(channelMappings.productId, products.id))
    .leftJoin(availableSq, eq(availableSq.productId, products.id))
    .where(eq(products.archived, false))

  const since = new Date(Date.now() - 24 * 3600_000)
  const [errors] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(syncLog)
    // פער כמות הוא אזהרה עם KPI משלו, לא תקלה
    .where(and(eq(syncLog.success, false), ne(syncLog.action, 'qty_mismatch'), gte(syncLog.createdAt, since)))

  const lastImport = await db.query.syncLog.findFirst({
    where: and(eq(syncLog.job, IMPORT_JOB), eq(syncLog.action, 'run')),
    orderBy: desc(syncLog.createdAt),
  })

  const recentFailures = await db
    .select({ id: syncLog.id, createdAt: syncLog.createdAt, job: syncLog.job, action: syncLog.action, error: syncLog.error, productId: syncLog.productId })
    .from(syncLog)
    .where(and(eq(syncLog.success, false), ne(syncLog.action, 'qty_mismatch')))
    .orderBy(desc(syncLog.createdAt))
    .limit(5)

  const missingEnv = missingEbayEnv()
  const ebay = missingEnv.length ? { configured: false as const, missingEnv } : { configured: true as const, ...(await getConnectionStatus()) }

  return {
    counts: { ...counts, errors24h: errors.n },
    lastImport: lastImport ? { at: lastImport.createdAt, success: lastImport.success, details: lastImport.details } : null,
    recentFailures,
    ebay,
    safety: { ebayWritesEnabled: ebayWritesEnabled(), pushEnabled: process.env.SYNC_PUSH_ENABLED === 'true' },
  }
}

export const PRODUCTS_PAGE = 200

export async function listProducts(opts: { q?: string; filter?: ProductFilter; offset?: number }) {
  const q = opts.q?.trim()
  const offset = Math.max(opts.offset ?? 0, 0)
  const conds: (SQL | undefined)[] = [eq(products.archived, false), filterWhere(opts.filter ?? 'all')]
  if (q) {
    const like = `%${q}%`
    conds.push(or(ilike(products.title, like), ilike(channelMappings.sku, like), ilike(channelMappings.ebayItemId, like), ilike(products.mpn, like)))
  }
  const where = and(...conds)

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      image: sql<string | null>`${products.images}->>0`,
      price: products.price,
      currency: products.currency,
      sku: channelMappings.sku,
      ebayItemId: channelMappings.ebayItemId,
      wooProductId: channelMappings.wooProductId,
      available: availableExpr,
      lastEbayQty: channelMappings.lastEbayQty,
      lastSyncedAt: channelMappings.lastSyncedAt,
      syncEnabled: channelMappings.syncEnabled,
    })
    .from(products)
    .innerJoin(channelMappings, eq(channelMappings.productId, products.id))
    .leftJoin(availableSq, eq(availableSq.productId, products.id))
    .where(where)
    // id שובר שוויון — הייבוא יוצר הרבה מוצרים באותו רגע, ובלעדיו דפים חופפים
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(PRODUCTS_PAGE)
    .offset(offset)

  const [totals] = await db
    .select({ total: sql<number>`count(*)::int`, inStock: sql<number>`count(*) filter (where ${availableExpr} > 0)::int` })
    .from(products)
    .innerJoin(channelMappings, eq(channelMappings.productId, products.id))
    .leftJoin(availableSq, eq(availableSq.productId, products.id))
    .where(where)

  const next = offset + rows.length
  return { products: rows, total: totals.total, inStock: totals.inStock, nextOffset: next < totals.total ? next : null }
}

export async function getProductDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const product = await db.query.products.findFirst({ where: eq(products.id, id) })
  if (!product) return null
  const mapping = await db.query.channelMappings.findFirst({ where: eq(channelMappings.productId, id) })
  const ledger = await db.select().from(stockLedger).where(eq(stockLedger.productId, id)).orderBy(desc(stockLedger.createdAt), desc(stockLedger.id))
  const log = await db.select().from(syncLog).where(eq(syncLog.productId, id)).orderBy(desc(syncLog.createdAt)).limit(50)
  const available = ledger.reduce((sum, e) => sum + e.delta, 0)
  return { product, mapping, ledger, log, available }
}

export type LogStatus = 'all' | 'ok' | 'fail'

export async function listLog(opts: { status?: LogStatus; job?: string; before?: number; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const conds: (SQL | undefined)[] = []
  if (opts.status === 'ok') conds.push(eq(syncLog.success, true))
  if (opts.status === 'fail') conds.push(eq(syncLog.success, false))
  if (opts.job) conds.push(eq(syncLog.job, opts.job))
  if (opts.before) conds.push(lt(syncLog.id, opts.before))
  const rows = await db
    .select({
      id: syncLog.id,
      createdAt: syncLog.createdAt,
      job: syncLog.job,
      channel: syncLog.channel,
      action: syncLog.action,
      success: syncLog.success,
      error: syncLog.error,
      details: syncLog.details,
      durationMs: syncLog.durationMs,
      productId: syncLog.productId,
      productTitle: products.title,
    })
    .from(syncLog)
    .leftJoin(products, eq(products.id, syncLog.productId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(syncLog.id))
    .limit(limit + 1)
  const jobs = await db.selectDistinct({ job: syncLog.job }).from(syncLog).orderBy(syncLog.job)
  return { rows: rows.slice(0, limit), nextBefore: rows.length > limit ? rows[limit - 1].id : null, jobs: jobs.map((j) => j.job) }
}
