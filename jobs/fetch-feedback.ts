// משיכת הפידבק שהמוכרת קיבלה ב-eBay → ebay_feedback. קריאה בלבד (GetFeedback).
//
//   npm run job:fetch-feedback [-- --max-pages=5 --full]
//
// רגיל: עוצר בדף הראשון בלי פידבק חדש. --full: עובר על כל הדפים עד --max-pages (עד 50).

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const { fetchEbayFeedback } = await import('@/lib/reviews/fetch')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = await fetchEbayFeedback({ maxPages: Number(arg('max-pages')) || 5, full: args.includes('--full') })
    const s = r.summary
    console.log(`דפים ${r.pages} · קריאות ${r.calls} · נקראו ${r.fetched} · חדשים ${r.created} · עודכנו ${r.updated} · ב-eBay סה״כ ${r.totalOnEbay}`)
    console.log(`ציון ${s.score ?? '—'} · 12 חודשים: ${s.positive12m ?? '—'} חיוביים / ${s.neutral12m ?? '—'} ניטרליים / ${s.negative12m ?? '—'} שליליים → ${s.positivePct12m ?? '—'}% חיובי`)
    if (s.ratings.length) console.log(`דירוגים: ${s.ratings.map((x) => `${x.key} ${x.rating}`).join(' · ')}`)
  } catch (err) {
    console.error('[fetch-feedback] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
