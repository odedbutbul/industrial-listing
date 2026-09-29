import { googlePost } from './auth'
import { gscSiteUrl } from './config'

// Search Console — searchAnalytics.query (קריאה בלבד).

export interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

const PAGE_SIZE = 25_000

/** כל השורות לטווח (עם דפדוף). תאריכים YYYY-MM-DD. */
export async function gscQuery(opts: { startDate: string; endDate: string; dimensions: ('date' | 'page' | 'query' | 'device' | 'country')[]; maxRows?: number }): Promise<GscRow[]> {
  const site = gscSiteUrl()
  if (!site) throw new Error('חסר GSC_SITE_URL')
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`
  const rows: GscRow[] = []
  const max = opts.maxRows ?? 200_000
  for (let startRow = 0; startRow < max; startRow += PAGE_SIZE) {
    const r = await googlePost<{ rows?: GscRow[] }>(url, { startDate: opts.startDate, endDate: opts.endDate, dimensions: opts.dimensions, rowLimit: PAGE_SIZE, startRow, dataState: 'all' })
    rows.push(...(r.rows ?? []))
    if ((r.rows?.length ?? 0) < PAGE_SIZE) break
  }
  return rows
}
