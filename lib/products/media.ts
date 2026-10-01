import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { writeSyncLog } from '@/lib/sync/log'
import { deleteWpMedia } from '@/lib/woo/wp-media'

// תמונות של מוצרים ידניים — רק רשומות (מזהה + כתובת בחנות). הקבצים בספריית המדיה של WordPress.

const { mediaFiles } = schema
export const MEDIA_JOB = 'manual_media'
/** תמונה מטופס שלא נשמר נמחקת מהחנות אחרי יממה */
const ORPHAN_MS = 24 * 3600_000

/** מוחק מספריית המדיה ומהמערכת. כשל במחיקה בחנות — הרשומה נשארת, נרשם בלוג, ומנסים שוב בניקוי הבא. */
export async function deleteMedia(rows: { id: string; wooMediaId: number }[], reason: string): Promise<number> {
  let deleted = 0
  for (const r of rows) {
    try {
      await deleteWpMedia(r.wooMediaId)
      await db.delete(mediaFiles).where(eq(mediaFiles.id, r.id))
      deleted++
    } catch (e) {
      await writeSyncLog({ job: MEDIA_JOB, channel: 'woo', action: 'delete_media', success: false, error: e instanceof Error ? e.message : String(e), details: { wooMediaId: r.wooMediaId, reason } })
    }
  }
  if (deleted) await writeSyncLog({ job: MEDIA_JOB, channel: 'woo', action: 'delete_media', success: true, details: { deleted, reason } })
  return deleted
}

/** תמונות שהועלו בטופס שלא נשמר, לפני יותר מיממה */
export async function cleanupOrphanMedia(limit = 20): Promise<number> {
  const rows = await db
    .select({ id: mediaFiles.id, wooMediaId: mediaFiles.wooMediaId })
    .from(mediaFiles)
    .where(and(isNull(mediaFiles.productId), lt(mediaFiles.createdAt, new Date(Date.now() - ORPHAN_MS))))
    .limit(limit)
  return rows.length ? deleteMedia(rows, 'orphan') : 0
}

/** תמונות של מוצר שכבר לא בו (הוסרו בטופס) */
export async function deleteRemovedMedia(productId: string, keepIds: string[]): Promise<number> {
  const rows = await db.select({ id: mediaFiles.id, wooMediaId: mediaFiles.wooMediaId }).from(mediaFiles).where(eq(mediaFiles.productId, productId))
  const keep = new Set(keepIds)
  const gone = rows.filter((r) => !keep.has(r.id))
  return gone.length ? deleteMedia(gone, 'removed_from_product') : 0
}

/** רשומות התמונות של מוצר לפי סדר products.images (כתובות בחנות) */
export async function productMedia(productId: string, images: string[]) {
  if (!images.length) return []
  const rows = await db.select().from(mediaFiles).where(and(eq(mediaFiles.productId, productId), inArray(mediaFiles.wooSrc, images)))
  const bySrc = new Map(rows.map((r) => [r.wooSrc, r]))
  return images.map((src) => bySrc.get(src)).filter((r): r is NonNullable<typeof r> => !!r)
}
