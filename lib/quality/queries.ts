import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import type { IssueCheck } from './checks'
import { QUALITY_SCAN_KEY, type QualityScanResult } from './scan'

const I = schema.listingIssues
const P = schema.products
const M = schema.channelMappings

export const ISSUE_CHECKS: IssueCheck[] = ['title_content', 'shared_image', 'desc_mismatch', 'mpn_near_miss', 'specifics_other', 'brand_conflict']
export type QualityFilter = 'open' | 'dismissed' | 'resolved' | IssueCheck
export const QUALITY_FILTERS: QualityFilter[] = ['open', ...ISSUE_CHECKS, 'dismissed', 'resolved']

function filterSql(f: QualityFilter): SQL {
  if (f === 'dismissed' || f === 'resolved' || f === 'open') return eq(I.status, f)
  return and(eq(I.status, 'open'), eq(I.check, f))!
}

const severityOrder = sql`case ${I.severity} when 'high' then 0 when 'medium' then 1 else 2 end`

export async function getLastScan(): Promise<(QualityScanResult & { updatedAt: string }) | null> {
  const [row] = await db.select().from(schema.syncCursors).where(eq(schema.syncCursors.key, QUALITY_SCAN_KEY))
  if (!row) return null
  try {
    return { ...(JSON.parse(row.value) as QualityScanResult), updatedAt: row.updatedAt.toISOString() }
  } catch {
    return null
  }
}

export async function listIssues(opts: { filter: QualityFilter; offset?: number; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)
  const rows = await db
    .select({
      id: I.id,
      productId: I.productId,
      check: I.check,
      severity: I.severity,
      message: I.message,
      details: I.details,
      status: I.status,
      firstSeenAt: I.firstSeenAt,
      dismissedAt: I.dismissedAt,
      resolvedAt: I.resolvedAt,
      title: P.title,
      image: sql<string | null>`${P.images}->>0`,
      sku: M.sku,
      ebayItemId: M.ebayItemId,
    })
    .from(I)
    .innerJoin(P, eq(P.id, I.productId))
    .leftJoin(M, eq(M.productId, I.productId))
    .where(filterSql(opts.filter))
    .orderBy(severityOrder, asc(I.check), desc(I.firstSeenAt), asc(I.id))
    .limit(limit + 1)
    .offset(offset)

  const [c] = await db
    .select({
      open: sql<number>`count(*) filter (where ${I.status} = 'open')::int`,
      high: sql<number>`count(*) filter (where ${I.status} = 'open' and ${I.severity} = 'high')::int`,
      products: sql<number>`count(distinct ${I.productId}) filter (where ${I.status} = 'open')::int`,
      dismissed: sql<number>`count(*) filter (where ${I.status} = 'dismissed')::int`,
      resolved: sql<number>`count(*) filter (where ${I.status} = 'resolved')::int`,
    })
    .from(I)
  const perCheck = await db
    .select({ check: I.check, n: sql<number>`count(*)::int` })
    .from(I)
    .where(eq(I.status, 'open'))
    .groupBy(I.check)
  const counts = Object.fromEntries(ISSUE_CHECKS.map((k) => [k, perCheck.find((x) => x.check === k)?.n ?? 0])) as Record<IssueCheck, number>

  return {
    rows: rows.slice(0, limit),
    nextOffset: rows.length > limit ? offset + limit : null,
    counts: { open: c.open, high: c.high, products: c.products, dismissed: c.dismissed, resolved: c.resolved, ...counts },
    lastScan: await getLastScan(),
  }
}

/** ממצאים פתוחים של מוצר אחד — לדף המוצר */
export async function productIssues(productId: string) {
  return db
    .select({ id: I.id, check: I.check, severity: I.severity, message: I.message, details: I.details })
    .from(I)
    .where(and(eq(I.productId, productId), eq(I.status, 'open')))
    .orderBy(severityOrder)
}

/** "בדקתי, זה בסדר" (dismiss) או החזרה לפתוח (reopen) */
export async function setIssueStatus(id: string, action: 'dismiss' | 'reopen') {
  const [row] = await db
    .update(I)
    .set(action === 'dismiss' ? { status: 'dismissed', dismissedAt: new Date() } : { status: 'open', dismissedAt: null })
    .where(and(eq(I.id, id), action === 'dismiss' ? eq(I.status, 'open') : eq(I.status, 'dismissed')))
    .returning({ id: I.id, status: I.status })
  return row ?? null
}
