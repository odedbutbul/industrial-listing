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

export type ProductFilter = 'all' | 'in_stock' | 'sold_out' | 'mismatch' | 'no_woo' | 'ready' | 'in_woo'

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
    case 'in_woo':
      return sql`${channelMappings.wooProductId} is not null`
    case 'ready':
      // מוכנים לחנות: יש פרטים מלאים, לא מקושרים, הסנכרון פעיל
      return sql`${products.detailsFetchedAt} is not null and ${channelMappings.wooProductId} is null and ${channelMappings.syncEnabled}`
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
      hasDetails: sql<boolean>`${products.detailsFetchedAt} is not null`,
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

// ── הזמנות משני הערוצים ─────────────────────────────────────────────────────

export type OrderChannelFilter = 'all' | 'ebay' | 'woo'

/** חודש קלנדרי בשעון ישראל, "2026-09" */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MONTH_TZ = 'Asia/Jerusalem'
const monthOf = (col: SQL | typeof schema.processedOrders.orderCreatedAt) => sql`to_char(${col} at time zone ${sql.raw(`'${MONTH_TZ}'`)}, 'YYYY-MM')`
export type OrderStateFilter = 'all' | 'active' | 'cancelled' | 'attention'

/** שורות הזמנה (שורה = מוצר בהזמנה), מהחדשה לישנה. מסמן בכל שורה באיזו פלטפורמה נמכר. */
export async function listOrderLines(opts: { channel?: OrderChannelFilter; state?: OrderStateFilter; q?: string; month?: string; before?: string; limit?: number }) {
  const po = schema.processedOrders
  const o = schema.orders
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const conds: (SQL | undefined)[] = []
  if (opts.channel === 'ebay' || opts.channel === 'woo') conds.push(eq(po.channel, opts.channel))
  if (opts.state === 'cancelled') conds.push(sql`${o.state} in ('cancelled', 'refunded')`)
  if (opts.state === 'active') conds.push(sql`${o.state} not in ('cancelled', 'refunded')`)
  if (opts.state === 'attention') conds.push(sql`(${po.status} = 'unmapped' or ${o.state} = 'cancel_requested')`)
  if (opts.month && MONTH_RE.test(opts.month)) conds.push(sql`${monthOf(po.orderCreatedAt)} = ${opts.month}`)
  const q = opts.q?.trim()
  if (q) {
    const like = `%${q}%`
    conds.push(or(ilike(po.title, like), ilike(po.sku, like), ilike(po.externalOrderId, like), ilike(po.externalItemId, like)))
  }
  // דפדוף לפי (זמן הזמנה, id) — יציב גם כשנכנסות הזמנות חדשות
  if (opts.before) {
    const [at, id] = opts.before.split('|')
    if (at && id) conds.push(sql`(${po.orderCreatedAt}, ${po.id}) < (${new Date(at)}, ${Number(id)})`)
  }
  const rows = await db
    .select({
      id: po.id,
      channel: po.channel,
      orderId: po.externalOrderId,
      lineId: po.externalLineId,
      placedAt: po.orderCreatedAt,
      title: po.title,
      sku: po.sku,
      itemId: po.externalItemId,
      quantity: po.quantity,
      lineTotal: po.lineTotal,
      currency: po.currency,
      lineStatus: po.status,
      note: po.note,
      productId: po.productId,
      productTitle: products.title,
      orderState: o.state,
      fulfillmentStatus: o.fulfillmentStatus,
      customerId: o.customerId,
      customerName: sql<string | null>`(select case when c.anonymized_at is null then coalesce(c.name, c.ebay_username) end from customers c where c.id = ${o.customerId})`,
      shipCountry: o.shipCountry,
    })
    .from(po)
    .leftJoin(o, and(eq(o.channel, po.channel), eq(o.externalOrderId, po.externalOrderId)))
    .leftJoin(products, eq(products.id, po.productId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(po.orderCreatedAt), desc(po.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  const [counts] = await db
    .select({
      all: sql<number>`count(*)::int`,
      ebay: sql<number>`count(*) filter (where ${po.channel} = 'ebay')::int`,
      woo: sql<number>`count(*) filter (where ${po.channel} = 'woo')::int`,
      attention: sql<number>`count(*) filter (where ${po.status} = 'unmapped')::int`,
      last30: sql<number>`count(*) filter (where ${po.orderCreatedAt} > now() - interval '30 days')::int`,
    })
    .from(po)
  const lastPoll = await db.query.syncLog.findFirst({
    where: and(eq(syncLog.job, 'poll-ebay-orders'), eq(syncLog.action, 'run')),
    orderBy: desc(syncLog.createdAt),
  })
  return {
    rows: page,
    nextBefore: rows.length > limit && last?.placedAt ? `${new Date(last.placedAt).toISOString()}|${last.id}` : null,
    counts,
    lastPoll: lastPoll ? { at: lastPoll.createdAt, success: lastPoll.success, error: lastPoll.error, details: lastPoll.details } : null,
    wooConnected: !!process.env.WC_BASE_URL,
  }
}

export interface MonthSummary {
  month: string
  channel: 'ebay' | 'woo'
  /** הזמנות שלא בוטלו */
  orders: number
  units: number
  /** מה שהקונים שילמו (eBay lineItem.total) */
  sales: number
  /** מחיר הפריטים בלבד (eBay lineItemCost) */
  items: number
  /** שורות פעילות שעוד אין להן מחיר פריטים (נקלטו לפני שנשמר) */
  itemsMissing: number
  cancelledOrders: number
  cancelledSales: number
}

/**
 * סיכום כספי לפי חודש (שעון ישראל) ופלטפורמה. רק USD נסכם; שורות במטבע אחר נספרות בנפרד.
 * "פעילה" = ההזמנה לא בוטלה ולא הוחזר עליה כסף, והשורה לא בוטלה.
 */
export async function ordersMonthlySummary(opts: { channel?: OrderChannelFilter; from?: string; to?: string }) {
  const po = schema.processedOrders
  const o = schema.orders
  const month = monthOf(po.orderCreatedAt)
  const conds: (SQL | undefined)[] = [sql`${po.orderCreatedAt} is not null`]
  if (opts.channel === 'ebay' || opts.channel === 'woo') conds.push(eq(po.channel, opts.channel))
  const base = and(...conds)
  const ranged = and(
    base,
    opts.from && MONTH_RE.test(opts.from) ? sql`${month} >= ${opts.from}` : undefined,
    opts.to && MONTH_RE.test(opts.to) ? sql`${month} <= ${opts.to}` : undefined,
  )
  const active = sql`(coalesce(${o.state}::text, 'paid') not in ('cancelled', 'refunded') and ${po.status} <> 'cancelled')`
  const usd = sql`coalesce(${po.currency}, 'USD') = 'USD'`

  const rows = await db
    .select({
      month: sql<string>`${month}`,
      channel: po.channel,
      orders: sql<number>`count(distinct ${po.externalOrderId}) filter (where ${active})::int`,
      units: sql<number>`coalesce(sum(${po.quantity}) filter (where ${active}), 0)::int`,
      sales: sql<string>`coalesce(sum(${po.lineTotal}) filter (where ${active} and ${usd}), 0)`,
      items: sql<string>`coalesce(sum(${po.itemAmount}) filter (where ${active} and ${usd}), 0)`,
      itemsMissing: sql<number>`count(*) filter (where ${active} and ${po.itemAmount} is null)::int`,
      cancelledOrders: sql<number>`count(distinct ${po.externalOrderId}) filter (where not ${active})::int`,
      cancelledSales: sql<string>`coalesce(sum(${po.lineTotal}) filter (where not ${active} and ${usd}), 0)`,
    })
    .from(po)
    .leftJoin(o, and(eq(o.channel, po.channel), eq(o.externalOrderId, po.externalOrderId)))
    .where(ranged)
    .groupBy(sql`1`, po.channel)
    .orderBy(desc(sql`1`), po.channel)

  const [span] = await db
    .select({
      first: sql<string | null>`min(${month})`,
      last: sql<string | null>`max(${month})`,
      otherCurrency: sql<number>`count(*) filter (where not ${usd})::int`,
    })
    .from(po)
    .where(base)

  return {
    months: rows.map((r): MonthSummary => ({ ...r, sales: Number(r.sales), items: Number(r.items), cancelledSales: Number(r.cancelledSales) })),
    /** החודש הראשון והאחרון שיש בהם הזמנות — לבוררי הטווח */
    first: span?.first ?? null,
    last: span?.last ?? null,
    otherCurrency: span?.otherCurrency ?? 0,
    timezone: MONTH_TZ,
  }
}
