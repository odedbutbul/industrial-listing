import { googlePost } from './auth'
import { ga4PropertyId } from './config'

// GA4 Data API — runReport (קריאה בלבד).

interface RunReportResponse {
  dimensionHeaders?: { name: string }[]
  metricHeaders?: { name: string }[]
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]
  rowCount?: number
}

export type Ga4Row = Record<string, string>

const PAGE_SIZE = 100_000

/** מחזיר שורות כאובייקט {שם מימד/מדד: ערך}. תאריך GA מגיע כ-YYYYMMDD ומומר ל-YYYY-MM-DD. */
export async function ga4Report(opts: { startDate: string; endDate: string; dimensions: string[]; metrics: string[]; maxRows?: number }): Promise<Ga4Row[]> {
  const id = ga4PropertyId()
  if (!id) throw new Error('חסר GA4_PROPERTY_ID')
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`
  const out: Ga4Row[] = []
  const max = opts.maxRows ?? 500_000
  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const r = await googlePost<RunReportResponse>(url, {
      dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
      dimensions: opts.dimensions.map((name) => ({ name })),
      metrics: opts.metrics.map((name) => ({ name })),
      limit: PAGE_SIZE,
      offset,
      keepEmptyRows: false,
    })
    const dims = r.dimensionHeaders?.map((h) => h.name) ?? opts.dimensions
    const mets = r.metricHeaders?.map((h) => h.name) ?? opts.metrics
    for (const row of r.rows ?? []) {
      const o: Ga4Row = {}
      dims.forEach((d, i) => (o[d] = row.dimensionValues[i]?.value ?? ''))
      mets.forEach((m, i) => (o[m] = row.metricValues[i]?.value ?? '0'))
      if (o.date && /^\d{8}$/.test(o.date)) o.date = `${o.date.slice(0, 4)}-${o.date.slice(4, 6)}-${o.date.slice(6, 8)}`
      out.push(o)
    }
    if ((r.rows?.length ?? 0) < PAGE_SIZE || offset + PAGE_SIZE >= (r.rowCount ?? 0)) break
  }
  return out
}
