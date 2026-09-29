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
  kind: 'import-preview' | 'import' | 'enrich' | 'orders-poll'
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
