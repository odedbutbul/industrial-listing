// צורות התשובות של /api/sync/* ו-/api/ebay/import כפי שהן מגיעות לדפדפן (תאריכים כמחרוזות).

export type EbayStatus =
  | { configured: false; missingEnv: string[] }
  | {
      configured: true
      environment: 'sandbox' | 'production'
      connected: boolean
      accessExpiresAt: string | null
      refreshExpiresAt: string | null
      scopes: string[]
      updatedAt: string | null
    }

export interface Overview {
  counts: { products: number; inStock: number; soldOut: number; units: number; mismatches: number; wooLinked: number; errors24h: number }
  lastImport: { at: string; success: boolean; details: Record<string, number> | null } | null
  recentFailures: { id: number; createdAt: string; job: string; action: string; error: string | null; productId: string | null }[]
  ebay: EbayStatus
  safety: { ebayWritesEnabled: boolean; pushEnabled: boolean }
}

export interface ProductRow {
  id: string
  title: string
  image: string | null
  price: string | null
  currency: string
  sku: string
  ebayItemId: string | null
  wooProductId: number | null
  available: number
  lastEbayQty: number | null
  lastSyncedAt: string | null
  syncEnabled: boolean
  hasDetails: boolean
  /** ארה"ב + שאר העולם בלבד. null = מחירי המשלוח עוד לא נמשכו */
  ship: Pick<ShippingCosts, 'us' | 'intl' | 'currency' | 'globalShipping'> | null
}

export interface ShippingOption {
  service: string | null
  cost: string | null
  additionalCost: string | null
  free: boolean
  shipTo: string[]
}

export interface ShippingCosts {
  type: string | null
  currency: string | null
  us: ShippingOption | null
  intl: ShippingOption | null
  domestic: ShippingOption[]
  international: ShippingOption[]
  globalShipping: boolean
  excludeLocations: string[]
  policyName: string | null
}

export interface LedgerEntry {
  id: number
  delta: number
  source: string
  reason: string
  externalOrderId: string | null
  externalLineId: string | null
  note: string | null
  createdAt: string
}

export interface LogRow {
  id: number
  createdAt: string
  job: string
  channel: string | null
  action: string
  success: boolean
  error: string | null
  details: Record<string, unknown> | null
  durationMs: number | null
  productId: string | null
  productTitle?: string | null
}

export interface ProductDetail {
  product: {
    id: string
    title: string
    description: string | null
    condition: string | null
    price: string | null
    currency: string
    images: string[]
    brand: string | null
    mpn: string | null
    ebayCategoryId: string | null
    ebayCategoryName: string | null
    subtitle: string | null
    conditionId: string | null
    conditionDescription: string | null
    itemSpecifics: Record<string, string[]> | null
    shipping: {
      weightMajor: number | null
      weightMinor: number | null
      weightUnit: string | null
      length: number | null
      width: number | null
      depth: number | null
      dimensionUnit: string | null
      packageType: string | null
    } | null
    shippingCosts: ShippingCosts | null
    shippingCostsFetchedAt: string | null
    location: string | null
    country: string | null
    ebayListingStartedAt: string | null
    detailsFetchedAt: string | null
    createdAt: string
    updatedAt: string
  }
  mapping: {
    sku: string
    ebayItemId: string | null
    wooProductId: number | null
    syncEnabled: boolean
    lastEbayQty: number | null
    lastWooQty: number | null
    lastSyncedAt: string | null
  } | null
  ledger: LedgerEntry[]
  log: LogRow[]
  available: number
}

export interface ImportResult {
  runId: string
  dryRun: boolean
  pagesRead: number
  totalOnEbay: number
  ebayCalls: number
  created: number
  unchanged: number
  skipped: { itemId: string; reason: string; detail?: string }[]
  mismatches: { itemId: string; sku: string; ledgerQty: number; ebayQty: number }[]
  errors: { itemId: string; error: string }[]
  generatedSkus: { itemId: string; sku: string }[]
  durationMs: number
}

export interface BackgroundRun {
  id: string
  kind: 'import-preview' | 'import' | 'enrich' | 'orders-poll' | 'woo-preview' | 'woo-create' | 'woo-shipping-preview' | 'woo-shipping' | 'ebay-prices'
  status: 'running' | 'done' | 'failed'
  startedAt: string
  finishedAt: string | null
  progress: { phase: 'pages' | 'writing' | 'details'; done: number; total: number } | null
  result: unknown
  error: string | null
}

export interface WooConnectionInfo {
  storeUrl: string | null
  wcVersion: string | null
  wpVersion: string | null
  currency: string | null
  manageStock: boolean | null
  products: number | null
  webhooks: number | null
}

export type WooTestResult = { ok: true; info: WooConnectionInfo; checkedAt: string } | { ok: false; error: string; checkedAt: string }

export interface WooStatus {
  configured: boolean
  missingEnv: string[]
  baseUrl: string | null
  lastTest: WooTestResult | null
}

export type WooPlanStatus = 'create' | 'link' | 'skip'

export interface WooPlanItem {
  productId: string
  title: string
  sku: string
  status: WooPlanStatus
  notes: string[]
  wooProductId: number | null
}

export interface WooPlan {
  items: WooPlanItem[]
  counts: Record<WooPlanStatus, number>
  newBrands: string[]
}

export interface WooPushResult extends WooPlan {
  runId: string
  created: number
  linked: number
  failed: { productId: string; sku: string; error: string }[]
  brandsCreated: string[]
}

// ── לידים מהאתר ──

export type LeadStatus = 'new' | 'in_progress' | 'quoted' | 'won' | 'lost'
export type LeadKind = 'rfq' | 'msg'

export interface LeadRow {
  id: string
  ref: string
  kind: LeadKind
  status: LeadStatus
  name: string | null
  company: string | null
  email: string
  countryName: string | null
  part: string | null
  maker: string | null
  qty: number | null
  message: string | null
  short: boolean
  filesCount: number
  submittedAt: string
}

export interface LeadList {
  rows: LeadRow[]
  counts: { all: number; open: number; new: number; closed: number }
  nextBefore: string | null
}

export interface LeadDetail extends Omit<LeadRow, 'filesCount'> {
  wpId: number
  phone: string | null
  country: string | null
  condition: string | null
  neededBy: string | null
  orderRef: string | null
  sourceUrl: string | null
  files: { n: number; name: string; size: number }[]
  receivedVia: 'push' | 'pull'
  note: string | null
  statusChangedAt: string | null
  createdAt: string
}

export interface ShippingSyncItem {
  productId: string
  title: string
  sku: string
  wooProductId: number
  status: 'update' | 'same' | 'no_data' | 'missing'
  current: { us: string; intl: string } | null
  next: { us: string; intl: string } | null
  /** מחיר המוצר: בחנות → במערכת. null = לא משתנה */
  price: { current: string; next: string } | null
  shipping: boolean
}

export interface ShippingSyncPlan {
  items: ShippingSyncItem[]
  counts: Record<ShippingSyncItem['status'], number>
  changes: { price: number; shipping: number }
  lastEbayFetch: string | null
}

/** משיכת מחירים ומשלוח מ-eBay (lib/sync/shipping-costs.ts) */
export interface EbayPricesResult {
  updated: number
  priceChanged: number
  notInSystem: number
  errors: { page: number; error: string }[]
}

export interface ShippingSyncResult extends ShippingSyncPlan {
  runId: string
  updated: number
  failed: { productId: string; sku: string; error: string }[]
}
