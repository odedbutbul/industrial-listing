import { sql } from 'drizzle-orm'
import type { ShippingCosts } from '@/lib/ebay/trading'
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
  'ignored', // לא רלוונטי (למשל הזמנה מלפני הייבוא — כבר כלולה במלאי הפתיחה)
])

/** מצב הזמנה כפי שמוצג במסך ההזמנות (מנורמל בין הערוצים) */
export const orderStateEnum = pgEnum('order_state', ['paid', 'pending', 'cancel_requested', 'cancelled', 'refunded'])

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
  /** מחירי משלוח מ-eBay: ארה"ב + שאר העולם + כל השירותים (ShippingDetails) */
  shippingCosts: jsonb('shipping_costs').$type<ShippingCosts | null>(),
  shippingCostsFetchedAt: timestamp('shipping_costs_fetched_at', { withTimezone: true }),
  location: text('location'),
  country: text('country'),
  ebayListingStartedAt: timestamp('ebay_listing_started_at', { withTimezone: true }),
  /** מתי נקראו הפרטים המלאים (GetItem). null = רק מה שיש ברשימה. */
  detailsFetchedAt: timestamp('details_fetched_at', { withTimezone: true }),
  // ── מוצר ידני (נוצר במערכת, לא קשור ל-eBay) ──
  /** ebay = יובא ממודעה ב-eBay · manual = נוצר ידנית במערכת, חנות בלבד */
  source: text('source').$type<'ebay' | 'manual'>().notNull().default('ebay'),
  shortDescription: text('short_description'),
  salePrice: numeric('sale_price', { precision: 12, scale: 2 }),
  saleFrom: timestamp('sale_from', { withTimezone: true }),
  saleTo: timestamp('sale_to', { withTimezone: true }),
  /** slug-ים מ-CATEGORY_TREE (lib/woo/categorize.ts) */
  categorySlugs: jsonb('category_slugs').$type<string[]>(),
  tags: jsonb('tags').$type<string[]>(),
  /** משקל ומידות ביחידות של החנות (WooCommerce → Settings → Products) */
  packageDims: jsonb('package_dims').$type<{ weight: string; length: string; width: string; height: string } | null>(),
  /** שאלות ותשובות של המוצר → _vz_faq בחנות */
  faq: jsonb('faq').$type<{ q: string; a: string }[] | null>(),
  /** טקסט חלופי לכל תמונה: media_files.id → alt */
  imageAlts: jsonb('image_alts').$type<Record<string, string> | null>(),
  /** הקטגוריה הראשית (פירורי לחם ב-theme) — slug מתוך category_slugs */
  primaryCategory: text('primary_category'),
  ...timestamps,
}, (t) => [check('products_source_chk', sql`${t.source} in ('ebay', 'manual')`)])

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

/**
 * לקוחות — אדם אחד לכל שורה, מקושר להזמנות שלו (orders.customer_id).
 * החלטת עודד 29/09/2026: שם, מייל, טלפון ומיקום (מדינה / מחוז / עיר) — בלי כתובת רחוב.
 * מייל וטלפון מוצפנים (AES-256-GCM, lib/crypto.ts); email_hash (HMAC) משמש לזיהוי ולחיפוש לפי מייל.
 * דיוור: רק מי שנתן הסכמה (marketing_consent) ולא הסיר את עצמו. קוני eBay נכנסים חסומים לדיוור (מדיניות eBay).
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name'),
    emailEnc: text('email_enc'),
    emailHash: text('email_hash'),
    phoneEnc: text('phone_enc'),
    /** ISO 3166-1 alpha-2 */
    countryCode: text('country_code'),
    region: text('region'),
    city: text('city'),
    ebayUsername: text('ebay_username'),
    /** מאיפה הגיע לראשונה */
    firstChannel: channelEnum('first_channel').notNull(),
    /** מועד ההזמנה האחרונה שממנה עודכנו הפרטים — פרטים מהזמנה ישנה לא דורסים חדשים */
    detailsFromAt: timestamp('details_from_at', { withTimezone: true }),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    /** woo_checkout | manual */
    consentSource: text('consent_source'),
    consentAt: timestamp('consent_at', { withTimezone: true }),
    consentNote: text('consent_note'),
    /** למה לא לדוור גם בלי הסכמה מפורשת: ebay_buyer */
    marketingBlocked: text('marketing_blocked'),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    /** אחרי בקשת מחיקה: הפרטים האישיים נמחקו, ההזמנות נשארו */
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('customers_email_hash_uq').on(t.emailHash).where(sql`${t.emailHash} is not null`),
    uniqueIndex('customers_ebay_username_uq').on(t.ebayUsername).where(sql`${t.ebayUsername} is not null`),
    index('customers_country_idx').on(t.countryCode),
  ],
)

/** כותרת הזמנה מכל ערוץ — לתצוגה. פרטי הקונה נשמרים ב-customers (מקושר ב-customer_id), לא כאן. */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: channelEnum('channel').notNull(),
    externalOrderId: text('external_order_id').notNull(),
    state: orderStateEnum('state').notNull(),
    /** סטטוס המקור כמו שהוא (לבדיקה): eBay orderPaymentStatus / cancelState / orderFulfillmentStatus */
    sourceStatus: text('source_status'),
    fulfillmentStatus: text('fulfillment_status'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    total: numeric('total', { precision: 12, scale: 2 }),
    currency: text('currency'),
    lineCount: integer('line_count').notNull().default(0),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    /** מדינת המשלוח של ההזמנה (ISO alpha-2) */
    shipCountry: text('ship_country'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('orders_channel_external_uq').on(t.channel, t.externalOrderId),
    index('orders_placed_idx').on(t.placedAt),
    index('orders_customer_idx').on(t.customerId),
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
    title: text('title'),
    /** מזהה המודעה/המוצר בערוץ (eBay legacyItemId, Woo product_id) */
    externalItemId: text('external_item_id'),
    /** eBay lineItem.total — מה שהקונה שילם על השורה (לפי תיעוד eBay: פריט + משלוח + מסים, פחות הנחות) */
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }),
    /** מחיר הפריטים בלבד (eBay lineItemCost = מחיר יחידה × כמות), בלי משלוח ומסים */
    itemAmount: numeric('item_amount', { precision: 12, scale: 2 }),
    currency: text('currency'),
    /** למה השורה לא נרשמה ב-ledger / מה קרה בה */
    note: text('note'),
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

// ── אנליטיקס: Search Console + Google Analytics 4 (קריאה בלבד מגוגל) ─────────
// שורה לכל יום. job יומי (jobs/fetch-analytics.ts) מושך שוב את הימים האחרונים ומעדכן (upsert),
// כי גוגל משלים נתונים באיחור של 2–3 ימים. כתובות נשמרות כנתיב מנורמל (lib/analytics/paths.ts).

/** Search Console לפי דף. position_sum = מיקום ממוצע × חשיפות, כדי לסכם כמה ימים בממוצע משוקלל. */
export const gscPagesDaily = pgTable(
  'gsc_pages_daily',
  {
    date: text('date').notNull(),
    page: text('page').notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    positionSum: numeric('position_sum', { precision: 16, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('gsc_pages_daily_uq').on(t.date, t.page)],
)

/** Search Console לפי מילת חיפוש + דף. */
export const gscQueriesDaily = pgTable(
  'gsc_queries_daily',
  {
    date: text('date').notNull(),
    query: text('query').notNull(),
    page: text('page').notNull(),
    clicks: integer('clicks').notNull(),
    impressions: integer('impressions').notNull(),
    positionSum: numeric('position_sum', { precision: 16, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('gsc_queries_daily_uq').on(t.date, t.query, t.page), index('gsc_queries_daily_date_idx').on(t.date)],
)

/** GA4 ברמת האתר, יום. עלות פרסום רק אם Google Ads מקושר ל-GA (אחרת null). */
export const gaSiteDaily = pgTable('ga_site_daily', {
  date: text('date').primaryKey(),
  users: integer('users').notNull(),
  newUsers: integer('new_users').notNull(),
  sessions: integer('sessions').notNull(),
  engagedSessions: integer('engaged_sessions').notNull(),
  engagementSeconds: numeric('engagement_seconds', { precision: 16, scale: 2 }).notNull(),
  pageViews: integer('page_views').notNull(),
  addToCarts: integer('add_to_carts').notNull(),
  checkouts: integer('checkouts').notNull(),
  purchases: integer('purchases').notNull(),
  revenue: numeric('revenue', { precision: 14, scale: 2 }).notNull(),
  adCost: numeric('ad_cost', { precision: 14, scale: 2 }),
  adClicks: integer('ad_clicks'),
})

/** GA4 לפי מימד (ערוץ תנועה / מכשיר / מדינה), יום. */
export const gaBreakdownDaily = pgTable(
  'ga_breakdown_daily',
  {
    date: text('date').notNull(),
    dimension: text('dimension').notNull(), // channel | device | country
    value: text('value').notNull(),
    users: integer('users').notNull(),
    sessions: integer('sessions').notNull(),
    engagedSessions: integer('engaged_sessions').notNull(),
    purchases: integer('purchases').notNull(),
    revenue: numeric('revenue', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('ga_breakdown_daily_uq').on(t.date, t.dimension, t.value)],
)

/** GA4 לפי דף. */
export const gaPagesDaily = pgTable(
  'ga_pages_daily',
  {
    date: text('date').notNull(),
    page: text('page').notNull(),
    views: integer('views').notNull(),
    users: integer('users').notNull(),
    engagementSeconds: numeric('engagement_seconds', { precision: 16, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('ga_pages_daily_uq').on(t.date, t.page)],
)

/** GA4 לפי מוצר (אירועי ecommerce: view_item / add_to_cart / purchase). item_id = מה שהתוסף בחנות שולח (SKU או מזהה). */
export const gaItemsDaily = pgTable(
  'ga_items_daily',
  {
    date: text('date').notNull(),
    itemId: text('item_id').notNull(),
    itemName: text('item_name').notNull(),
    viewed: integer('viewed').notNull(),
    addedToCart: integer('added_to_cart').notNull(),
    purchased: integer('purchased').notNull(),
    revenue: numeric('revenue', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('ga_items_daily_uq').on(t.date, t.itemId, t.itemName)],
)

/** תמונת מצב של מוצרי החנות (GET בלבד) — לחיבור בין כתובת דף / item_id לבין מוצר, מלאי ומחיר. */
export const wooCatalog = pgTable('woo_catalog', {
  wooProductId: bigint('woo_product_id', { mode: 'number' }).primaryKey(),
  sku: text('sku'),
  name: text('name').notNull(),
  path: text('path'),
  status: text('status').notNull(),
  stockStatus: text('stock_status'),
  stockQuantity: integer('stock_quantity'),
  price: numeric('price', { precision: 12, scale: 2 }),
  wooCreatedAt: timestamp('woo_created_at', { withTimezone: true }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

/** הוצאות שיווק שמוזנות ידנית (לחישוב ROI / ROAS). חודש בפורמט YYYY-MM. */
export const marketingSpend = pgTable(
  'marketing_spend',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    month: text('month').notNull(),
    channel: text('channel').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => [uniqueIndex('marketing_spend_month_channel_uq').on(t.month, t.channel), check('marketing_spend_amount_nonneg', sql`${t.amount} >= 0`)],
)

// ── לידים מהאתר (Request a Part + Contact) ──────────────────────────────────
// האתר שומר כל פנייה אצלו קודם (wp-admin → Requests) ושולח עותק חתום ל-/api/leads/ingest.
// job משיכה (jobs/pull-leads.ts) משלים מה שלא הגיע. ref ייחודי = ליד שנשלח פעמיים נרשם פעם אחת.

export const leadKindEnum = pgEnum('lead_kind', ['rfq', 'msg'])

export const leadStatusEnum = pgEnum('lead_status', ['new', 'in_progress', 'quoted', 'won', 'lost'])

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** RFQ-20123 / MSG-20124 — המספר שהלקוח רואה באתר */
    ref: text('ref').notNull(),
    kind: leadKindEnum('kind').notNull(),
    /** מזהה הרשומה ב-WordPress (vz_request) — לקבצים ולסמן המשיכה */
    wpId: integer('wp_id').notNull(),
    status: leadStatusEnum('status').notNull().default('new'),
    name: text('name'),
    company: text('company'),
    email: text('email').notNull(),
    phone: text('phone'),
    country: text('country'),
    countryName: text('country_name'),
    part: text('part'),
    maker: text('maker'),
    qty: integer('qty'),
    condition: text('condition'),
    neededBy: text('needed_by'),
    /** Notes בבקשת חלק / גוף ההודעה בצור קשר */
    message: text('message'),
    orderRef: text('order_ref'),
    sourceUrl: text('source_url'),
    /** הטופס הקצר (אין תוצאות / פריט שנמכר) */
    short: boolean('short').notNull().default(false),
    /** [{ n, name, size }] — הקבצים עצמם נשארים באתר, מחוץ לתיקייה הציבורית */
    files: jsonb('files').$type<{ n: number; name: string; size: number }[]>().notNull().default([]),
    /** push = נשלח מהאתר מיד · pull = נמשך ע"י job הגיבוי */
    receivedVia: text('received_via').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    /** הערה פנימית — לא נשלחת לשום מקום */
    note: text('note'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    raw: jsonb('raw').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('leads_ref_uq').on(t.ref),
    index('leads_submitted_idx').on(t.submittedAt),
    index('leads_status_idx').on(t.status),
    check('leads_qty_pos', sql`${t.qty} is null or ${t.qty} > 0`),
  ],
)

// ── השוואת מחירים מול מתחרים ב-eBay (Browse API, קריאה בלבד) ──────────────────

/**
 * בדיקת מחיר אחת למוצר, למדינת יעד אחת, בריצה אחת. הקונה משווה מחיר כולל משלוח עד אליו —
 * אנחנו שולחים מישראל, מתחרה מארה"ב שולח בזול בתוך ארה"ב. לכן כל מדינה נבדקת בנפרד.
 */
export const priceChecks = pgTable(
  'price_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    /** מדינת הקונה (ISO-2) שלפיה eBay חישב משלוח */
    country: text('country').notNull(),
    query: text('query').notNull(),
    /** כמה מודעות eBay מצא לחיפוש (לפני סינון) */
    totalResults: integer('total_results').notNull().default(0),
    ourPrice: numeric('our_price', { precision: 12, scale: 2 }),
    /** המשלוח הזול ביותר שלנו למדינה (לפי eBay). null = לא נשלח / לא ידוע */
    ourShipping: numeric('our_shipping', { precision: 12, scale: 2 }),
    /** כל אפשרויות המשלוח שלנו למדינה: [{ service, cost, minDate, maxDate }] */
    ourShippingOptions: jsonb('our_shipping_options'),
    conditionGroup: text('condition_group').notNull(),
    /** מודעות מתחרים בהשוואה (אותה קבוצת מצב, התאמה exact/likely). min/median/max לפי basis */
    compareCount: integer('compare_count').notNull().default(0),
    minPrice: numeric('min_price', { precision: 12, scale: 2 }),
    medianPrice: numeric('median_price', { precision: 12, scale: 2 }),
    maxPrice: numeric('max_price', { precision: 12, scale: 2 }),
    vsMedianPct: numeric('vs_median_pct', { precision: 8, scale: 2 }),
    vsMinPct: numeric('vs_min_pct', { precision: 8, scale: 2 }),
    position: text('position').notNull(),
    /** על מה מבוסס position: total = כולל משלוח למדינה · item = מחיר פריט בלבד (כשאין משלוח ידוע) */
    basis: text('basis').notNull(),
    /** מחיר פריט בלבד — אותו חישוב */
    itemStats: jsonb('item_stats'),
    error: text('error'),
  },
  (t) => [
    index('price_checks_product_idx').on(t.productId, t.checkedAt),
    index('price_checks_run_idx').on(t.runId),
    uniqueIndex('price_checks_run_product_country_uq').on(t.runId, t.productId, t.country),
  ],
)

/** מודעת מתחרה כפי שנראתה בבדיקה — תמונת מצב, כדי שתהיה היסטוריה */
export const competitorOffers = pgTable(
  'competitor_offers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    checkId: uuid('check_id')
      .notNull()
      .references(() => priceChecks.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ebayItemId: text('ebay_item_id').notNull(),
    legacyItemId: text('legacy_item_id'),
    title: text('title').notNull(),
    seller: text('seller'),
    sellerFeedbackScore: integer('seller_feedback_score'),
    price: numeric('price', { precision: 12, scale: 2 }),
    currency: text('currency'),
    /** משלוח למדינת הבדיקה לפי eBay. null = לא ידוע / לא שולח */
    shipping: numeric('shipping', { precision: 12, scale: 2 }),
    shippingType: text('shipping_type'),
    conditionId: text('condition_id'),
    condition: text('condition'),
    conditionGroup: text('condition_group').notNull(),
    buyingOptions: jsonb('buying_options').$type<string[]>().notNull().default([]),
    url: text('url'),
    country: text('country'),
    matchLevel: text('match_level').notNull(),
    matchScore: integer('match_score').notNull(),
    /** נכלל בחישוב (אותה קבוצת מצב, התאמה exact/likely, מחיר ב-USD, לא מכירה פומבית בלבד) */
    compared: boolean('compared').notNull().default(false),
    /** אישור / דחייה ידנית של ההתאמה (בהמשך, מהמסך) */
    manualMatch: boolean('manual_match'),
  },
  (t) => [
    uniqueIndex('competitor_offers_check_item_uq').on(t.checkId, t.ebayItemId),
    index('competitor_offers_product_idx').on(t.productId),
    index('competitor_offers_seller_idx').on(t.seller),
  ],
)

// ── ביקורות מ-eBay (פידבק שהמוכרת קיבלה, GetFeedback — קריאה בלבד) ─────────────

/**
 * פידבק אחד שקונה השאיר למוכרת. feedback_id ייחודי = משיכה חוזרת מעדכנת ולא מכפילה.
 * שם הקונה נשמר מוסתר בלבד (d***k) — לא שומרים את שם המשתמש המלא.
 * show_on_site נקבע רק ידנית במסך; שום ביקורת לא מוצגת באתר בלי בחירה.
 */
export const ebayFeedback = pgTable(
  'ebay_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackId: text('feedback_id').notNull(),
    /** Positive · Neutral · Negative */
    commentType: text('comment_type').notNull(),
    commentText: text('comment_text').notNull().default(''),
    commentTime: timestamp('comment_time', { withTimezone: true }).notNull(),
    buyerMasked: text('buyer_masked'),
    buyerScore: integer('buyer_score'),
    itemId: text('item_id'),
    itemTitle: text('item_title'),
    itemPrice: numeric('item_price', { precision: 12, scale: 2 }),
    currency: text('currency'),
    /** תגובת המוכרת לפידבק (FeedbackResponse), אם יש */
    response: text('response'),
    showOnSite: boolean('show_on_site').notNull().default(false),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('ebay_feedback_feedback_id_uq').on(t.feedbackId),
    index('ebay_feedback_time_idx').on(t.commentTime),
    index('ebay_feedback_item_idx').on(t.itemId),
    check('ebay_feedback_show_positive', sql`not ${t.showOnSite} or ${t.commentType} = 'Positive'`),
  ],
)

// ── תמונות של מוצרים ידניים ──────────────────────────────────────────────────

/**
 * תמונה של מוצר ידני. הקובץ עצמו לא נשמר במערכת (החלטת עודד 01/10/2026): הוא עולה ישר לספריית המדיה
 * של WordPress, וכאן רק המזהה והכתובת שם. product_id null = הועלתה בטופס שעוד לא נשמר (נמחקת אחרי 24 שעות).
 */
export const mediaFiles = pgTable(
  'media_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** ה-attachment בספריית המדיה של החנות */
    wooMediaId: bigint('woo_media_id', { mode: 'number' }).notNull(),
    wooSrc: text('woo_src').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_files_product_idx').on(t.productId), check('media_files_mime_chk', sql`${t.mime} in ('image/jpeg', 'image/png', 'image/webp')`)],
)

// ── בדיקת איכות מודעות (שכבה 1, בלי AI) ──────────────────────────────────────

/**
 * ממצא של בדיקת איכות: מודעה שכנראה שוכפלה ממודעה אחרת ולא עודכנה (תמונה משותפת, כותרת שלא תואמת לתוכן…).
 * הכללים ב-lib/quality/checks.ts. key יציב בין סריקות — כך "בדקתי, זה בסדר" נשמר.
 * status: open = פתוח · dismissed = סומן כתקין ע"י המשתמש · resolved = לא נמצא בסריקה האחרונה (תוקן).
 * קריאה בלבד מול eBay: הסריקה קוראת רק מה-DB, והתיקון עצמו נעשה ב-eBay ע"י המוכרת.
 */
export const listingIssues = pgTable(
  'listing_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    check: text('check').notNull(),
    severity: text('severity').$type<'high' | 'medium' | 'low'>().notNull(),
    key: text('key').notNull(),
    message: text('message').notNull(),
    details: jsonb('details').notNull().default({}),
    status: text('status').$type<'open' | 'dismissed' | 'resolved'>().notNull().default('open'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('listing_issues_product_key_uq').on(t.productId, t.key),
    index('listing_issues_status_idx').on(t.status, t.severity),
    check('listing_issues_severity_chk', sql`${t.severity} in ('high', 'medium', 'low')`),
    check('listing_issues_status_chk', sql`${t.status} in ('open', 'dismissed', 'resolved')`),
  ],
)
