// משיכת לידים מהאתר (גיבוי ל-push המיידי) → leads. כפילויות נבלעות לפי ref.
//
//   npm run job:pull-leads
//
// Cron בשרת (כל 10 דקות): cd /var/www/stock-sync.1wp.site && node --env-file=.env node_modules/tsx/dist/cli.mjs jobs/pull-leads.ts
// יוצא עם 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const { leadsConfigured } = await import('@/lib/leads/signature')
  if (!leadsConfigured()) {
    // לפני שהוגדר הסוד המשותף — לא נכשלים כל 10 דקות בלוג, רק יוצאים
    console.log('LEADS_SHARED_SECRET not set — skipping')
    return
  }
  const { pullLeads } = await import('@/lib/leads/pull')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')
  try {
    console.log(JSON.stringify(await pullLeads(), null, 2))
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[pull-leads] failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
