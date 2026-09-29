import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { ga4Report } from '@/lib/google/ga4'
import { googleAccessToken } from '@/lib/google/auth'
import { googleEnvStatus } from '@/lib/google/config'
import { gscQuery } from '@/lib/google/gsc'
import { writeSyncLog } from '@/lib/sync/log'
import { ANALYTICS_JOB } from './fetch'
import { daysAgo } from './paths'

// בדיקת החיבור לגוגל: טוקן + שאילתה קטנה לכל נכס. קריאה בלבד.

export interface GoogleTestResult {
  ok: boolean
  checkedAt: string
  token: { ok: boolean; error?: string }
  gsc: { ok: boolean; skipped?: boolean; error?: string; rows?: number }
  ga4: { ok: boolean; skipped?: boolean; error?: string; rows?: number }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function testGoogleConnection(): Promise<GoogleTestResult> {
  const env = googleEnvStatus()
  const started = Date.now()
  const r: GoogleTestResult = { ok: false, checkedAt: new Date().toISOString(), token: { ok: false }, gsc: { ok: false, skipped: !env.gsc }, ga4: { ok: false, skipped: !env.ga4 } }
  try {
    await googleAccessToken()
    r.token.ok = true
  } catch (e) {
    r.token.error = msg(e)
  }
  if (r.token.ok) {
    const range = { startDate: daysAgo(7), endDate: daysAgo(0) }
    await Promise.all([
      env.gsc &&
        gscQuery({ ...range, dimensions: ['date'], maxRows: 10 }).then(
          (rows) => (r.gsc = { ok: true, rows: rows.length }),
          (e) => (r.gsc = { ok: false, error: msg(e) }),
        ),
      env.ga4 &&
        ga4Report({ ...range, dimensions: ['date'], metrics: ['sessions'], maxRows: 10 }).then(
          (rows) => (r.ga4 = { ok: true, rows: rows.length }),
          (e) => (r.ga4 = { ok: false, error: msg(e) }),
        ),
    ])
  }
  r.ok = r.token.ok && (r.gsc.ok || !!r.gsc.skipped) && (r.ga4.ok || !!r.ga4.skipped) && !(r.gsc.skipped && r.ga4.skipped)
  await writeSyncLog({ job: ANALYTICS_JOB, action: 'google_connection', success: r.ok, error: r.ok ? null : [r.token.error, r.gsc.error, r.ga4.error].filter(Boolean).join(' · ') || 'לא הוגדר אף נכס', details: r, durationMs: Date.now() - started })
  return r
}

export async function lastGoogleTest(): Promise<GoogleTestResult | null> {
  const row = await db.query.syncLog.findFirst({
    where: (l, { and }) => and(eq(l.job, ANALYTICS_JOB), eq(l.action, 'google_connection')),
    orderBy: desc(schema.syncLog.createdAt),
  })
  return (row?.details as GoogleTestResult) ?? null
}

export async function lastAnalyticsFetch() {
  const rows = await db.query.syncLog.findMany({
    where: (l, { and, inArray }) => and(eq(l.job, ANALYTICS_JOB), inArray(l.action, ['gsc_fetch', 'ga4_fetch', 'woo_catalog_fetch'])),
    orderBy: desc(schema.syncLog.createdAt),
    limit: 12,
  })
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!latest.has(r.action)) latest.set(r.action, r)
  return Array.from(latest.values()).map((r) => ({ action: r.action, at: r.createdAt.toISOString(), success: r.success, error: r.error, details: r.details }))
}
