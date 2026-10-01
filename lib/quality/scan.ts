import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { runQualityChecks, type QualityIssue } from './checks'

// סריקת איכות המודעות: קוראת את המוצרים מה-DB (בלי קריאה ל-eBay), מריצה את הכללים ומעדכנת listing_issues.
// ממצא שנמצא שוב — מתעדכן (וסטטוס "בסדר" נשמר). ממצא פתוח שלא נמצא הפעם — "תוקן".

export const QUALITY_SCAN_KEY = 'quality_last_scan'

export interface QualityScanResult {
  scannedAt: string
  products: number
  found: number
  created: number
  resolved: number
  reopened: number
  durationMs: number
}

const I = schema.listingIssues

export async function scanListingQuality(): Promise<QualityScanResult> {
  return withJobLock('quality-scan', async () => {
    const started = Date.now()
    try {
      const rows = await db
        .select({
          id: schema.products.id,
          title: schema.products.title,
          brand: schema.products.brand,
          mpn: schema.products.mpn,
          description: schema.products.description,
          itemSpecifics: schema.products.itemSpecifics,
          images: schema.products.images,
          sku: schema.channelMappings.sku,
        })
        .from(schema.products)
        .leftJoin(schema.channelMappings, eq(schema.channelMappings.productId, schema.products.id))
        .where(and(eq(schema.products.source, 'ebay'), eq(schema.products.archived, false)))

      const issues = runQualityChecks(rows)
      const r = await db.transaction(async (tx) => {
        const existing = await tx.select({ id: I.id, productId: I.productId, key: I.key, status: I.status }).from(I)
        const byKey = new Map(existing.map((e) => [`${e.productId}|${e.key}`, e]))
        const now = new Date()
        let created = 0
        let reopened = 0
        const seen = new Set<string>()
        const fresh: QualityIssue[] = []
        for (const i of issues) {
          const k = `${i.productId}|${i.key}`
          if (seen.has(k)) continue
          seen.add(k)
          const e = byKey.get(k)
          if (!e) {
            fresh.push(i)
            continue
          }
          if (e.status === 'resolved') reopened++
          await tx
            .update(I)
            .set({
              severity: i.severity,
              check: i.check,
              message: i.message,
              details: i.details,
              lastSeenAt: now,
              // "בסדר" נשאר "בסדר"; מה שתוקן וחזר — נפתח מחדש
              ...(e.status === 'resolved' ? { status: 'open' as const, resolvedAt: null } : {}),
            })
            .where(eq(I.id, e.id))
        }
        for (let n = 0; n < fresh.length; n += 500) {
          const chunk = fresh.slice(n, n + 500)
          await tx.insert(I).values(chunk.map((i) => ({ productId: i.productId, check: i.check, severity: i.severity, key: i.key, message: i.message, details: i.details, firstSeenAt: now, lastSeenAt: now })))
          created += chunk.length
        }
        const gone = existing.filter((e) => e.status === 'open' && !seen.has(`${e.productId}|${e.key}`)).map((e) => e.id)
        for (let n = 0; n < gone.length; n += 500) {
          await tx.update(I).set({ status: 'resolved', resolvedAt: now }).where(inArray(I.id, gone.slice(n, n + 500)))
        }
        return { created, reopened, resolved: gone.length }
      })

      const result: QualityScanResult = {
        scannedAt: new Date().toISOString(),
        products: rows.length,
        found: issues.length,
        ...r,
        durationMs: Date.now() - started,
      }
      await db
        .insert(schema.syncCursors)
        .values({ key: QUALITY_SCAN_KEY, value: JSON.stringify(result) })
        .onConflictDoUpdate({ target: schema.syncCursors.key, set: { value: JSON.stringify(result), updatedAt: sql`now()` } })
      await writeSyncLog({ job: 'quality-scan', action: 'scan_listings', success: true, details: { ...result }, durationMs: result.durationMs })
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await writeSyncLog({ job: 'quality-scan', action: 'scan_listings', success: false, error: msg.slice(0, 500), durationMs: Date.now() - started })
      throw e
    }
  })
}
