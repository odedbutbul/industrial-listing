import { randomUUID } from 'node:crypto'
import type { ImportProgress } from './import-ebay'

// ריצות ארוכות (ייבוא מ-eBay) רצות ברקע בתוך תהליך השרת, והמסך שואל על ההתקדמות.
// בקשת HTTP ארוכה נחתכת ע"י Cloudflare אחרי ~100 שניות (524) — לכן לא מחכים לה.
// המצב נשמר בזיכרון (תהליך PM2 יחיד). הנעילה האמיתית נגד ריצה כפולה היא ה-advisory lock ב-DB.

export type RunKind = 'import-preview' | 'import' | 'enrich'

export interface BackgroundRun {
  id: string
  kind: RunKind
  status: 'running' | 'done' | 'failed'
  startedAt: string
  finishedAt: string | null
  progress: ImportProgress | null
  result: unknown
  error: string | null
}

const g = globalThis as unknown as { syncRuns?: Map<string, BackgroundRun> }
const runs = (g.syncRuns ??= new Map())

export function runningRun(): BackgroundRun | null {
  return Array.from(runs.values()).find((r) => r.status === 'running') ?? null
}

export function getRun(id: string): BackgroundRun | null {
  return runs.get(id) ?? null
}

/** מתחיל ריצה ברקע. אם כבר רצה ריצה — מחזיר אותה (לא מתחיל שנייה). */
export function startRun(kind: RunKind, fn: (onProgress: (p: ImportProgress) => void) => Promise<unknown>): { run: BackgroundRun; started: boolean } {
  const existing = runningRun()
  if (existing) return { run: existing, started: false }

  const run: BackgroundRun = {
    id: randomUUID(),
    kind,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: null,
    result: null,
    error: null,
  }
  runs.set(run.id, run)
  // שומרים רק את 20 הריצות האחרונות
  if (runs.size > 20) runs.delete(runs.keys().next().value!)

  fn((p) => (run.progress = p))
    .then((result) => {
      run.status = 'done'
      run.result = result
    })
    .catch((err) => {
      run.status = 'failed'
      run.error = err instanceof Error ? err.message : String(err)
      console.error(`[background:${kind}] failed:`, err)
    })
    .finally(() => (run.finishedAt = new Date().toISOString()))

  return { run, started: true }
}
