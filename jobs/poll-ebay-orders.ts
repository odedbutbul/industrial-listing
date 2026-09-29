// משיכת הזמנות מ-eBay (Fulfillment API, קריאה בלבד) → orders + processed_orders + ledger. מצב צפייה: לא נשלח כלום.
//
//   npm run job:poll-ebay-orders                  # מהסמן האחרון (ריצה ראשונה: 30 ימים אחורה)
//   npm run job:poll-ebay-orders -- --days=7      # טווח ידני (לא מזיז את הסמן אחורה — רק קוראים שוב)
//
// Cron בשרת (כל 5 דקות): cd /var/www/stock-sync.1wp.site && node --env-file=.env node_modules/tsx/dist/cli.mjs jobs/poll-ebay-orders.ts
// יוצא עם 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const days = process.argv.slice(2).find((a) => a.startsWith('--days='))?.split('=')[1]
  const { pollEbayOrders } = await import('@/lib/sync/ebay-orders')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = await pollEbayOrders(days ? { from: new Date(Date.now() - Number(days) * 86400_000) } : {})
    console.log(JSON.stringify({ ...r, oversold: r.oversold.length ? r.oversold : 0 }, null, 2))
    process.exitCode = r.errors.length ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[poll-ebay-orders] failed:', err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
