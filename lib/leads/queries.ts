import { and, desc, eq, getTableColumns, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

const L = schema.leads

export type LeadStatus = (typeof schema.leadStatusEnum.enumValues)[number]
export const LEAD_STATUSES = schema.leadStatusEnum.enumValues
export type LeadStatusFilter = 'open' | 'new' | 'closed' | 'all'
export type LeadKindFilter = 'all' | 'rfq' | 'msg'

const OPEN: LeadStatus[] = ['new', 'in_progress', 'quoted']
const CLOSED: LeadStatus[] = ['won', 'lost']

const listCols = {
  id: L.id,
  ref: L.ref,
  kind: L.kind,
  status: L.status,
  name: L.name,
  company: L.company,
  email: L.email,
  countryName: L.countryName,
  part: L.part,
  maker: L.maker,
  qty: L.qty,
  message: L.message,
  short: L.short,
  filesCount: sql<number>`jsonb_array_length(${L.files})`.mapWith(Number),
  submittedAt: L.submittedAt,
}

/** רשימת לידים מהחדש לישן. before = submitted_at (ISO) של השורה האחרונה בעמוד הקודם. */
export async function listLeads(opts: { status?: LeadStatusFilter; kind?: LeadKindFilter; q?: string; before?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const base: (SQL | undefined)[] = []
  if (opts.kind === 'rfq' || opts.kind === 'msg') base.push(eq(L.kind, opts.kind))
  const q = opts.q?.trim().slice(0, 80)
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`
    base.push(or(ilike(L.ref, like), ilike(L.email, like), ilike(L.name, like), ilike(L.company, like), ilike(L.part, like), ilike(L.maker, like)))
  }
  const conds = [...base]
  if (opts.status === 'open') conds.push(inArray(L.status, OPEN))
  if (opts.status === 'new') conds.push(eq(L.status, 'new'))
  if (opts.status === 'closed') conds.push(inArray(L.status, CLOSED))
  if (opts.before) {
    const b = new Date(opts.before)
    if (!Number.isNaN(b.getTime())) conds.push(lt(L.submittedAt, b))
  }
  const rows = await db
    .select(listCols)
    .from(L)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(L.submittedAt), desc(L.id))
    .limit(limit + 1)
  const [c] = await db
    .select({
      all: sql<number>`count(*)`.mapWith(Number),
      open: sql<number>`count(*) filter (where ${inArray(L.status, OPEN)})`.mapWith(Number),
      new: sql<number>`count(*) filter (where ${L.status} = 'new')`.mapWith(Number),
      closed: sql<number>`count(*) filter (where ${inArray(L.status, CLOSED)})`.mapWith(Number),
    })
    .from(L)
    .where(base.length ? and(...base) : undefined)
  const page = rows.slice(0, limit)
  return { rows: page, counts: c, nextBefore: rows.length > limit ? page[page.length - 1].submittedAt.toISOString() : null }
}

export async function getLead(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { raw, ...cols } = getTableColumns(L)
  void raw // הגוף המקורי נשמר לתחקור, לא נשלח לדפדפן
  const [row] = await db.select(cols).from(L).where(eq(L.id, id))
  return row ?? null
}

/** עדכון סטטוס / הערה פנימית. מחזיר null אם הליד לא קיים. */
export async function updateLead(id: string, patch: { status?: LeadStatus; note?: string | null }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const set: Partial<typeof L.$inferInsert> = {}
  if (patch.status) {
    set.status = patch.status
    set.statusChangedAt = new Date()
  }
  if (patch.note !== undefined) set.note = patch.note?.trim().slice(0, 4000) || null
  if (!Object.keys(set).length) return getLead(id)
  const [row] = await db.update(L).set(set).where(eq(L.id, id)).returning({ id: L.id })
  return row ? getLead(row.id) : null
}

/** לסטטוס בסרגל ובסקירה: כמה חדשים, ומתי נקלט הליד האחרון. */
export async function leadsSummary() {
  const [r] = await db
    .select({ new: sql<number>`count(*) filter (where ${L.status} = 'new')`.mapWith(Number), last: sql<string | null>`max(${L.createdAt})` })
    .from(L)
  return { new: r?.new ?? 0, lastReceivedAt: r?.last ?? null }
}
