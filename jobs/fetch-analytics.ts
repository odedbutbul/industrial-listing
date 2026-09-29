// משיכת נתונים מ-Search Console, Google Analytics 4 ומוצרי החנות (קריאה בלבד) → Postgres, למסך התובנות.
//
//   npm run job:fetch-analytics                  # ריצה ראשונה: 90 ימים; אחר כך: 5 הימים האחרונים (גוגל משלים באיחור)
//   npm run job:fetch-analytics -- --days=480    # השלמת היסטוריה (Search Console שומר 16 חודשים)
//
// Cron בשרת (פעם ביום, 05:30): cd /var/www/stock-sync.1wp.site && node --env-file=.env node_modules/tsx/dist/cli.mjs jobs/fetch-analytics.ts
// יוצא עם 0 בהצלחה, 1 אם מקור אחד לפחות נכשל, 2 אם ריצה אחרת פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const days = process.argv.slice(2).find((a) => a.startsWith('--days='))?.split('=')[1]
  const { fetchAnalytics } = await import('@/lib/analytics/fetch')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = await fetchAnalytics(days ? { days: Number(days) } : {})
    console.log(JSON.stringify(r, null, 2))
    process.exitCode = r.sources.some((s) => !s.ok) ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[fetch-analytics] failed:', err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
