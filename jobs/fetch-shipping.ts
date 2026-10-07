// מחירי משלוח מ-eBay (ארה"ב + שאר העולם), מדיניות החזרות ומחיר המודעה לכל המוצרים — קריאה בלבד מול eBay.
//
//   npm run job:fetch-shipping -- --dry-run     # קורא ומסכם בלי לכתוב ל-DB (~34 קריאות ל-6,600 מודעות)
//   npm run job:fetch-shipping                  # שומר ב-products.shipping_costs + products.return_policy + products.price (רק מחיר שהשתנה, במודעת מחיר קבוע)
//   npm run job:fetch-shipping -- --max-pages=1
//
// יוצא עם קוד 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת כבר פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const { fetchShippingCosts } = await import('@/lib/sync/shipping-costs')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')

  try {
    const r = await fetchShippingCosts({ dryRun: args.includes('--dry-run'), maxPages: arg('max-pages') ? Number(arg('max-pages')) : undefined })
    console.log(JSON.stringify(r, null, 2))
    process.exitCode = r.errors.length ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[fetch-shipping] failed:', err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
