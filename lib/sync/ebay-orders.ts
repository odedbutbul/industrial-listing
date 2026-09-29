import { randomUUID } from 'node:crypto'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getOrdersModifiedBetween, type EbayOrder, type EbayOrderLine } from '@/lib/ebay/fulfillment'
import type { ImportProgress } from './import-ebay'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// קליטת הזמנות מ-eBay (Fulfillment API, קריאה בלבד) — מצב צפייה:
// ההזמנות נשמרות ומוצגות, והמלאי במערכת (ledger) מתעדכן. שום דבר לא נשלח ל-eBay או לאתר.
//
// כללים:
// - כל שורת הזמנה נרשמת פעם אחת (processed_orders, ייחודי לפי ערוץ+הזמנה+שורה).
// - מכירה מורידה מלאי רק אם ההזמנה נוצרה *אחרי* מלאי הפתיחה של המוצר (זמן הייבוא).
//   הזמנה מלפני כן כבר כלולה ב-QuantityAvailable שיובא — נרשמת כ-ignored, בלי ledger.
// - ביטול של הזמנה שהורידה מלאי מחזיר את הכמות (פעם אחת).
// - שורה שלא מזוהה ונמכרה *לפני* הייבוא — ignored (המודעה הסתיימה ולא יובאה; היסטוריה בלבד).
// - שורה שלא מזוהה ונמכרה *אחרי* הייבוא — unmapped, לבדיקה.
// - שורה unmapped שבריצה מאוחרת כבר אפשר לזהות (למשל אחרי תיקון SKU כפול) — מסווגת מחדש.
// - מכירה שמורידה מלאי מתחת ל-0 — נרשמת (זה קרה בפועל) ומסומנת oversold ב-sync_log.

export const EBAY_ORDERS_JOB = 'poll-ebay-orders'
const CURSOR_KEY = 'ebay_orders_last_modified'
/** חפיפה בין ריצות — הזמנה שהשתנתה בדיוק בגבול לא נופלת בין הכיסאות */
const OVERLAP_MS = 10 * 60 * 1000
const FIRST_RUN_DAYS = 30

export interface PollResult {
  runId: string
  from: string
  to: string
  ebayCalls: number
  orders: number
  newLines: number
  applied: number
  cancelled: number
  ignoredBeforeImport: number
  unmapped: number
  oversold: { sku: string; available: number }[]
  errors: { orderId: string; error: string }[]
  durationMs: number
}

type OrderState = (typeof schema.orderStateEnum.enumValues)[number]

function orderState(o: EbayOrder): OrderState {
  if (o.cancelState === 'CANCELED') return 'cancelled'
  if (o.cancelState === 'IN_PROGRESS' || o.cancelState === 'CANCEL_REQUESTED') return 'cancel_requested'
  if (o.paymentStatus === 'FULLY_REFUNDED') return 'refunded'
  if (o.paymentStatus === 'PENDING' || o.paymentStatus === 'FAILED') return 'pending'
  return 'paid'
}

/** "450.00" מה-DB מול "450.0" מ-eBay — אותו סכום */
const sameAmount = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Number(a) === Number(b))

/** eBay מוריד כמות כשנוצרת הזמנה; רק ביטול מלא מחזיר. החזר כספי לא מחזיר פריט למלאי אוטומטית. */
const isCancelled = (o: EbayOrder) => o.cancelState === 'CANCELED'

export async function pollEbayOrders(opts: { from?: Date; to?: Date; onProgress?: (p: ImportProgress) => void } = {}): Promise<PollResult> {
  return withJobLock(EBAY_ORDERS_JOB, () => runPoll(opts))
}

async function runPoll(opts: { from?: Date; to?: Date; onProgress?: (p: ImportProgress) => void }): Promise<PollResult> {
  const started = Date.now()
  const runId = randomUUID()
  const cursor = await db.query.syncCursors.findFirst({ where: eq(schema.syncCursors.key, CURSOR_KEY) })
  const to = opts.to ?? new Date()
  const from = opts.from ?? (cursor ? new Date(new Date(cursor.value).getTime() - OVERLAP_MS) : new Date(to.getTime() - FIRST_RUN_DAYS * 86400_000))

  const result: PollResult = {
    runId,
    from: from.toISOString(),
    to: to.toISOString(),
    ebayCalls: 0,
    orders: 0,
    newLines: 0,
    applied: 0,
    cancelled: 0,
    ignoredBeforeImport: 0,
    unmapped: 0,
    oversold: [],
    errors: [],
    durationMs: 0,
  }

  const { orders, calls } = await getOrdersModifiedBetween(from, to, (page, total) => opts.onProgress?.({ phase: 'pages', done: page, total }))
  result.ebayCalls = calls
  result.orders = orders.length

  // מיפוי: לפי מספר מודעה, ואם אין — לפי SKU
  const itemIds = Array.from(new Set(orders.flatMap((o) => o.lines.map((l) => l.itemId).filter((x): x is string => !!x))))
  const skus = Array.from(new Set(orders.flatMap((o) => o.lines.map((l) => l.sku).filter((x): x is string => !!x))))
  const mappings = itemIds.length || skus.length
    ? await db
        .select()
        .from(schema.channelMappings)
        .where(or(itemIds.length ? inArray(schema.channelMappings.ebayItemId, itemIds) : undefined, skus.length ? inArray(schema.channelMappings.sku, skus) : undefined))
    : []
  const byItem = new Map(mappings.filter((m) => m.ebayItemId).map((m) => [m.ebayItemId!, m]))
  const bySku = new Map(mappings.map((m) => [m.sku, m]))
  const resolve = (l: EbayOrderLine) => (l.itemId && byItem.get(l.itemId)) || (l.sku && bySku.get(l.sku)) || null

  // זמן הייבוא הראשון — הזמנה מלפניו של מודעה שלא יובאה היא היסטוריה, לא בעיה
  const [imp] = await db
    .select({ at: sql<Date | null>`min(${schema.stockLedger.createdAt})` })
    .from(schema.stockLedger)
    .where(eq(schema.stockLedger.reason, 'initial'))
  const importAt = imp?.at ? new Date(imp.at) : null

  let done = 0
  for (const o of orders) {
    try {
      await applyOrder(o, resolve, result, importAt)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      result.errors.push({ orderId: o.orderId, error })
      await writeSyncLog({ job: EBAY_ORDERS_JOB, runId, channel: 'ebay', action: 'apply_order', success: false, error, details: { orderId: o.orderId } })
    }
    opts.onProgress?.({ phase: 'writing', done: ++done, total: orders.length })
  }

  // הסמן מתקדם רק אם לא היו שגיאות — אחרת הריצה הבאה תנסה שוב את אותו טווח
  if (!result.errors.length) {
    await db
      .insert(schema.syncCursors)
      .values({ key: CURSOR_KEY, value: to.toISOString() })
      .onConflictDoUpdate({ target: schema.syncCursors.key, set: { value: to.toISOString() } })
  }

  result.durationMs = Date.now() - started
  await writeSyncLog({
    job: EBAY_ORDERS_JOB,
    runId,
    channel: 'ebay',
    action: 'run',
    success: result.errors.length === 0,
    error: result.errors.length ? `${result.errors.length} הזמנות לא נקלטו` : undefined,
    durationMs: result.durationMs,
    details: {
      from: result.from,
      to: result.to,
      ebayCalls: result.ebayCalls,
      orders: result.orders,
      newLines: result.newLines,
      applied: result.applied,
      cancelled: result.cancelled,
      ignoredBeforeImport: result.ignoredBeforeImport,
      unmapped: result.unmapped,
      oversold: result.oversold.length,
      errors: result.errors.length,
    },
  })
  return result
}

async function applyOrder(
  o: EbayOrder,
  resolve: (l: EbayOrderLine) => typeof schema.channelMappings.$inferSelect | null,
  result: PollResult,
  importAt: Date | null,
) {
  const state = orderState(o)
  const cancelled = isCancelled(o)

  await db.transaction(async (tx) => {
    // כותרת ההזמנה — תמיד מעודכנת למצב האחרון
    const header = {
      channel: 'ebay' as const,
      externalOrderId: o.orderId,
      state,
      sourceStatus: [o.paymentStatus, o.cancelState].filter(Boolean).join(' / ') || null,
      fulfillmentStatus: o.fulfillmentStatus,
      placedAt: o.createdAt,
      sourceUpdatedAt: o.lastModifiedAt,
      total: o.total,
      currency: o.currency,
      lineCount: o.lines.length,
    }
    await tx.insert(schema.orders).values(header).onConflictDoUpdate({
      target: [schema.orders.channel, schema.orders.externalOrderId],
      set: { ...header, updatedAt: new Date() },
    })

    for (const l of o.lines) {
      const m = resolve(l)
      let existing = await tx.query.processedOrders.findFirst({
        where: and(eq(schema.processedOrders.channel, 'ebay'), eq(schema.processedOrders.externalOrderId, o.orderId), eq(schema.processedOrders.externalLineId, l.lineItemId)),
      })
      // unmapped שאפשר עכשיו לסווג (מופה בינתיים, או שהתברר שהוא מלפני הייבוא) — מתחילים אותו מחדש
      const beforeImport = !!importAt && o.createdAt <= importAt
      if (existing?.status === 'unmapped' && (m || beforeImport)) {
        await tx.delete(schema.processedOrders).where(eq(schema.processedOrders.id, existing.id))
        existing = undefined
        result.newLines--
      }

      if (!existing) {
        result.newLines++
        const base = {
          channel: 'ebay' as const,
          externalOrderId: o.orderId,
          externalLineId: l.lineItemId,
          productId: m?.productId ?? null,
          sku: l.sku ?? m?.sku ?? null,
          quantity: l.quantity,
          orderCreatedAt: o.createdAt,
          title: l.title,
          externalItemId: l.itemId,
          lineTotal: l.lineTotal,
          itemAmount: l.itemAmount,
          currency: l.currency,
        }
        if (!m && beforeImport) {
          result.ignoredBeforeImport++
          await tx.insert(schema.processedOrders).values({ ...base, status: 'ignored', note: 'נמכר לפני הייבוא — המודעה כבר לא פעילה ולא יובאה' })
          continue
        }
        if (!m) {
          result.unmapped++
          await tx.insert(schema.processedOrders).values({ ...base, status: 'unmapped', note: 'נמכר אחרי הייבוא, אבל המודעה וה-SKU לא ממופים במערכת — לבדיקה' })
          continue
        }
        // מלאי הפתיחה של המוצר — הזמנה מלפניו כבר כלולה בכמות שיובאה
        const [opening] = await tx
          .select({ at: sql<Date>`min(${schema.stockLedger.createdAt})` })
          .from(schema.stockLedger)
          .where(and(eq(schema.stockLedger.productId, m.productId), eq(schema.stockLedger.reason, 'initial')))
        const snapshot = opening?.at ? new Date(opening.at) : m.createdAt
        if (o.createdAt <= snapshot) {
          result.ignoredBeforeImport++
          await tx.insert(schema.processedOrders).values({ ...base, status: 'ignored', note: 'לפני הייבוא — כבר כלולה במלאי הפתיחה' })
          continue
        }
        if (cancelled) {
          // בוטלה לפני שראינו אותה — לא הורידה מלאי ולא מחזירה
          result.cancelled++
          await tx.insert(schema.processedOrders).values({ ...base, status: 'cancelled', note: 'בוטלה לפני שנקלטה — המלאי לא השתנה' })
          continue
        }
        // נעילת המוצר: שתי מכירות של אותו פריט לא נרשמות במקביל
        await tx.execute(sql`select id from ${schema.products} where id = ${m.productId} for update`)
        const [sale] = await tx
          .insert(schema.stockLedger)
          .values({
            productId: m.productId,
            delta: -l.quantity,
            source: 'ebay',
            reason: 'sale',
            externalOrderId: o.orderId,
            externalLineId: l.lineItemId,
            idempotencyKey: `ebay:sale:${o.orderId}:${l.lineItemId}`,
          })
          .onConflictDoNothing({ target: schema.stockLedger.idempotencyKey })
          .returning({ id: schema.stockLedger.id })
        await tx.insert(schema.processedOrders).values({ ...base, status: 'applied', saleLedgerId: sale?.id ?? null })
        result.applied++
        const [{ available }] = await tx
          .select({ available: sql<number>`coalesce(sum(${schema.stockLedger.delta}), 0)::int` })
          .from(schema.stockLedger)
          .where(eq(schema.stockLedger.productId, m.productId))
        if (available < 0) {
          result.oversold.push({ sku: m.sku, available })
          await tx.insert(schema.syncLog).values({
            job: EBAY_ORDERS_JOB,
            runId: result.runId,
            channel: 'ebay',
            action: 'oversold',
            success: false,
            error: `המלאי ירד ל-${available} — נמכר יותר ממה שיש`,
            productId: m.productId,
            details: { orderId: o.orderId, lineItemId: l.lineItemId, sku: m.sku, available },
          })
        }
        continue
      }

      // שורה קיימת: הסכומים מתעדכנים (החזר חלקי, שורות שנקלטו לפני שנשמר מחיר הפריטים) — בלי לגעת במלאי
      if (!sameAmount(existing.lineTotal, l.lineTotal) || !sameAmount(existing.itemAmount, l.itemAmount) || existing.currency !== l.currency) {
        await tx
          .update(schema.processedOrders)
          .set({ lineTotal: l.lineTotal, itemAmount: l.itemAmount, currency: l.currency, updatedAt: new Date() })
          .where(eq(schema.processedOrders.id, existing.id))
      }
      // רק מעבר ל"בוטלה" משנה מלאי
      if (cancelled && existing.status === 'applied' && existing.productId) {
        await tx.execute(sql`select id from ${schema.products} where id = ${existing.productId} for update`)
        const [back] = await tx
          .insert(schema.stockLedger)
          .values({
            productId: existing.productId,
            delta: existing.quantity,
            source: 'ebay',
            reason: 'cancel',
            externalOrderId: o.orderId,
            externalLineId: l.lineItemId,
            idempotencyKey: `ebay:cancel:${o.orderId}:${l.lineItemId}`,
          })
          .onConflictDoNothing({ target: schema.stockLedger.idempotencyKey })
          .returning({ id: schema.stockLedger.id })
        await tx
          .update(schema.processedOrders)
          .set({ status: 'cancelled', cancelLedgerId: back?.id ?? null, note: 'בוטלה — הכמות הוחזרה למלאי' })
          .where(eq(schema.processedOrders.id, existing.id))
        result.cancelled++
      } else if (cancelled && existing.status === 'ignored') {
        await tx.update(schema.processedOrders).set({ note: 'לפני הייבוא; בוטלה אחר כך — ייבדק בהתאמה' }).where(eq(schema.processedOrders.id, existing.id))
      }
    }
  })
}
