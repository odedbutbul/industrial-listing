import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ── Enums ────────────────────────────────────────────────────────────────────

export const channelEnum = pgEnum('channel', ['ebay', 'woo'])

export const ebayEnvironmentEnum = pgEnum('ebay_environment', ['sandbox', 'production'])

/** מי יצר את שינוי המלאי */
export const ledgerSourceEnum = pgEnum('ledger_source', ['ebay', 'woo', 'manual', 'reconcile', 'import'])

export const ledgerReasonEnum = pgEnum('ledger_reason', [
  'initial', // מלאי פתיחה בייבוא
  'sale', // מכירה (delta שלילי)
  'cancel', // ביטול הזמנה (delta חיובי)
  'refund', // החזר עם החזרת פריט למלאי
  'manual_adjust', // תיקון ידני
  'reconcile_correction', // תיקון מ-job ההתאמה
])

export const orderStatusEnum = pgEnum('order_status', [
  'applied', // המכירה נרשמה ב-ledger
  'cancelled', // ההזמנה בוטלה והכמות הוחזרה
  'unmapped', // SKU לא מוכר — לא נרשם ב-ledger, דורש טיפול
  'ignored', // לא רלוונטי (למשל הזמנה בסטטוס שלא מוריד מלאי)
])

export const pushStatusEnum = pgEnum('push_status', ['pending', 'done', 'failed', 'superseded'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

// ── eBay OAuth ───────────────────────────────────────────────────────────────

/** טוקן אחד לכל סביבה. הטוקנים נשמרים מוצפנים (TOKEN_ENCRYPTION_KEY), לעולם לא כטקסט גלוי. */
export const ebayTokens = pgTable('ebay_tokens', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  environment: ebayEnvironmentEnum('environment').notNull().unique(),
  ebayUserId: text('ebay_user_id'),
  accessTokenEnc: text('access_token_enc').notNull(),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  scopes: text('scopes').notNull(),
  ...timestamps,
})

// ── מוצרים ומיפוי ────────────────────────────────────────────────────────────

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  condition: text('condition'),
  price: numeric('price', { precision: 12, scale: 2 }),
  currency: text('currency').notNull().default('USD'),
  images: jsonb('images').$type<string[]>().notNull().default([]),
  brand: text('brand'),
  mpn: text('mpn'),
  ebayCategoryId: text('ebay_category_id'),
  ebayCategoryName: text('ebay_category_name'),
  archived: boolean('archived').notNull().default(false),
  // פרטים מלאים מ-GetItem (שלב 2)
  subtitle: text('subtitle'),
  conditionId: text('condition_id'),
  conditionDescription: text('condition_description'),
  itemSpecifics: jsonb('item_specifics').$type<Record<string, string[]>>(),
  shipping: jsonb('shipping').$type<{
    weightMajor: number | null
    weightMinor: number | null
    weightUnit: string | null
    length: number | null
    width: number | null
    depth: number | null
    dimensionUnit: string | null
    packageType: string | null
  } | null>(),
  location: text('location'),
  country: text('country'),
  ebayListingStartedAt: timestamp('ebay_listing_started_at', { withTimezone: true }),
  /** מתי נקראו הפרטים המלאים (GetItem). null = רק מה שיש ברשימה. */
  detailsFetchedAt: timestamp('details_fetched_at', { withTimezone: true }),
  ...timestamps,
})

/** מיפוי 1:1 בין מוצר לבין הזהויות שלו בכל ערוץ. SKU הוא המפתח המשותף. */
export const channelMappings = pgTable(
  'channel_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .unique()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull().unique(),
    ebayItemId: text('ebay_item_id').unique(),
    wooProductId: bigint('woo_product_id', { mode: 'number' }).unique(),
    wooVariationId: bigint('woo_variation_id', { mode: 'number' }),
    /** כיבוי סנכרון למוצר בודד */
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    lastEbayQty: integer('last_ebay_qty'),
    lastWooQty: integer('last_woo_qty'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    ...timestamps,
  },
)

// ── מקור האמת למלאי ──────────────────────────────────────────────────────────

/**
 * כל שינוי מלאי הוא שורה. מלאי זמין = SUM(delta) לפי product_id.
 * idempotency_key ייחודי מבטיח שאותו אירוע לא נרשם פעמיים
 * (למשל `ebay:sale:<orderId>:<lineItemId>`).
 */
export const stockLedger = pgTable(
  'stock_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    delta: integer('delta').notNull(),
    source: ledgerSourceEnum('source').notNull(),
    reason: ledgerReasonEnum('reason').notNull(),
    externalOrderId: text('external_order_id'),
    externalLineId: text('external_line_id'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_ledger_product_idx').on(t.productId),
    check('stock_ledger_delta_nonzero', sql`${t.delta} <> 0`),
  ],
)

/** כל שורת הזמנה מכל ערוץ נרשמת פעם אחת בדיוק. */
export const processedOrders = pgTable(
  'processed_orders',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    channel: channelEnum('channel').notNull(),
    externalOrderId: text('external_order_id').notNull(),
    externalLineId: text('external_line_id').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku'),
    quantity: integer('quantity').notNull(),
    status: orderStatusEnum('status').notNull(),
    saleLedgerId: bigint('sale_ledger_id', { mode: 'number' }).references(() => stockLedger.id),
    cancelLedgerId: bigint('cancel_ledger_id', { mode: 'number' }).references(() => stockLedger.id),
    orderCreatedAt: timestamp('order_created_at', { withTimezone: true }),
    raw: jsonb('raw'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('processed_orders_line_uq').on(t.channel, t.externalOrderId, t.externalLineId),
    index('processed_orders_product_idx').on(t.productId),
  ],
)

// ── דחיפות לערוצים ───────────────────────────────────────────────────────────

/**
 * עדכוני כמות שממתינים לשליחה לערוץ. לכל (מוצר, ערוץ) יש לכל היותר שורה pending אחת —
 * דחיפה חדשה מעדכנת את desired_qty במקום ליצור שורה נוספת.
 */
export const pendingPushes = pgTable(
  'pending_pushes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    target: channelEnum('target').notNull(),
    desiredQty: integer('desired_qty').notNull(),
    status: pushStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('pending_pushes_one_pending_uq')
      .on(t.productId, t.target)
      .where(sql`${t.status} = 'pending'`),
    index('pending_pushes_due_idx').on(t.status, t.nextAttemptAt),
    check('pending_pushes_qty_nonneg', sql`${t.desiredQty} >= 0`),
  ],
)

// ── מצב jobs ולוג ────────────────────────────────────────────────────────────

/** מיקום ה-polling של כל job (למשל lastModifiedDate של הזמנות eBay). */
export const syncCursors = pgTable('sync_cursors', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

/** לוג לכל פעולת סנכרון — הצלחה וכישלון. */
export const syncLog = pgTable(
  'sync_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    runId: uuid('run_id'),
    job: text('job').notNull(),
    channel: channelEnum('channel'),
    action: text('action').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    success: boolean('success').notNull(),
    error: text('error'),
    details: jsonb('details'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('sync_log_created_idx').on(t.createdAt),
    index('sync_log_product_idx').on(t.productId),
    index('sync_log_run_idx').on(t.runId),
  ],
)
