// ייבוא מודעות פעילות מ-eBay ל-Postgres — קריאה בלבד מול eBay.
//
//   npm run job:import-ebay -- --dry-run            # מה ייובא, בלי לכתוב ל-DB
//   npm run job:import-ebay                          # ייבוא
//   npm run job:import-ebay -- --refresh-existing   # גם עדכון פרטי מוצרים קיימים (לא מלאי)
//   npm run job:import-ebay -- --max-pages=1
//
// יוצא עם קוד 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת כבר פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const maxPagesArg = args.find((a) => a.startsWith('--max-pages='))
  const { importEbayListings } = await import('@/lib/sync/import-ebay')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')

  try {
    const r = await importEbayListings({
      dryRun: args.includes('--dry-run'),
      refreshExisting: args.includes('--refresh-existing'),
      maxPages: maxPagesArg ? Number(maxPagesArg.split('=')[1]) : undefined,
    })
    console.log(JSON.stringify(r, null, 2))
    process.exitCode = r.errors.length ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[import-ebay] failed:', err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
