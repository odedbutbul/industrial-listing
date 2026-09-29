import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { LeadPayloadError, parseLeadPayload, storeLead } from './store'
import { wpLeadsGet } from './wp'

// גיבוי ל-push: מושך מהאתר כל ליד שה-id שלו אחרי הסמן, ושומר (כפילויות נבלעות לפי ref).
// הסמן זז רק במשיכה — push לא מזיז אותו, כך שליד שה-push שלו נכשל עדיין ייאסף.

const CURSOR = 'leads_pull_after_wp_id'
const PAGE = 50
const MAX_PAGES = 20

export interface PullResult {
  fetched: number
  created: number
  invalid: number
  cursor: number
}

export async function pullLeads(): Promise<PullResult> {
  return withJobLock('pull-leads', async () => {
    const started = Date.now()
    const [cur] = await db.select().from(schema.syncCursors).where(eq(schema.syncCursors.key, CURSOR))
    let after = Number(cur?.value ?? 0) || 0
    const r: PullResult = { fetched: 0, created: 0, invalid: 0, cursor: after }
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await wpLeadsGet(`/vz/v1/leads/after/${after}`)
        if (!res.ok) throw new Error(`האתר החזיר ${res.status}${res.status === 401 ? ' — החתימה נדחתה (סוד לא תואם או שעון)' : res.status === 404 ? ' — הנתיב לא קיים באתר (ה-theme לא עודכן?)' : ''}`)
        const body = (await res.json()) as { leads?: unknown[]; more?: boolean }
        const list = Array.isArray(body.leads) ? body.leads : []
        for (const item of list) {
          r.fetched++
          const wpId = Number((item as { wp_id?: unknown })?.wp_id)
          try {
            const { created } = await storeLead(parseLeadPayload(item, 'pull'))
            if (created) r.created++
          } catch (e) {
            if (!(e instanceof LeadPayloadError)) throw e
            r.invalid++
            await writeSyncLog({ job: 'leads', action: 'invalid_lead', success: false, error: e.message, details: { wpId } })
          }
          if (Number.isInteger(wpId) && wpId > after) after = wpId
        }
        await db
          .insert(schema.syncCursors)
          .values({ key: CURSOR, value: String(after) })
          .onConflictDoUpdate({ target: schema.syncCursors.key, set: { value: String(after) } })
        r.cursor = after
        if (!body.more || list.length < PAGE) break
      }
      await writeSyncLog({ job: 'leads', action: 'pull_leads', success: true, details: { ...r }, durationMs: Date.now() - started })
      return r
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await writeSyncLog({ job: 'leads', action: 'pull_leads', success: false, error: msg.slice(0, 500), details: { ...r }, durationMs: Date.now() - started })
      throw e
    }
  })
}
