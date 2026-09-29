import { db, schema } from '@/lib/db/client'

type SyncLogInsert = typeof schema.syncLog.$inferInsert

/** כתיבה ל-sync_log. כשל בכתיבת הלוג לא מפיל את הפעולה עצמה. */
export async function writeSyncLog(entries: SyncLogInsert | SyncLogInsert[]): Promise<void> {
  const rows = Array.isArray(entries) ? entries : [entries]
  if (!rows.length) return
  await db
    .insert(schema.syncLog)
    .values(rows)
    .catch((e) => console.error('[sync_log] write failed', e))
}
