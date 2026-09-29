import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { writeSyncLog } from '@/lib/sync/log'
import { WooApiError, wooGet } from './client'
import { WooConfigError } from './config'

// בדיקת חיבור לחנות — קריאה בלבד (GET). לא יוצרת ולא משנה כלום בחנות.

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

const JOB = 'woo_connection'

export async function testWooConnection(): Promise<WooTestResult> {
  const started = Date.now()
  const checkedAt = new Date().toISOString()
  try {
    // system_status דורש הרשאת קריאה ומחזיר גרסאות והגדרות בסיס
    const status = await wooGet<{
      environment?: { site_url?: string; version?: string; wp_version?: string }
      settings?: { currency?: string }
    }>('system_status')
    const [manage, products, webhooks] = await Promise.all([
      wooGet<{ value?: string }>('settings/products/woocommerce_manage_stock').then((r) => r.data.value === 'yes'),
      wooGet<unknown[]>('products', { per_page: 1, status: 'any' }).then((r) => r.total),
      wooGet<unknown[]>('webhooks', { per_page: 1 }).then((r) => r.total),
    ])
    const info: WooConnectionInfo = {
      storeUrl: status.data.environment?.site_url ?? null,
      wcVersion: status.data.environment?.version ?? null,
      wpVersion: status.data.environment?.wp_version ?? null,
      currency: status.data.settings?.currency ?? null,
      manageStock: manage,
      products,
      webhooks,
    }
    await writeSyncLog({ job: JOB, channel: 'woo', action: 'test', success: true, details: info, durationMs: Date.now() - started })
    return { ok: true, info, checkedAt }
  } catch (e) {
    const error = e instanceof WooApiError || e instanceof WooConfigError ? e.message : 'שגיאה לא צפויה בבדיקת החיבור'
    if (!(e instanceof WooApiError || e instanceof WooConfigError)) console.error('[woo] connection test failed', e)
    await writeSyncLog({
      job: JOB,
      channel: 'woo',
      action: 'test',
      success: false,
      error,
      details: e instanceof WooApiError ? { status: e.status, code: e.code } : null,
      durationMs: Date.now() - started,
    })
    return { ok: false, error, checkedAt }
  }
}

/** תוצאת הבדיקה האחרונה מ-sync_log (בלי לפנות לחנות). */
export async function lastWooTest(): Promise<WooTestResult | null> {
  const [row] = await db
    .select()
    .from(schema.syncLog)
    .where(eq(schema.syncLog.job, JOB))
    .orderBy(desc(schema.syncLog.createdAt))
    .limit(1)
  if (!row) return null
  const checkedAt = row.createdAt.toISOString()
  return row.success ? { ok: true, info: row.details as WooConnectionInfo, checkedAt } : { ok: false, error: row.error ?? 'הבדיקה נכשלה', checkedAt }
}
