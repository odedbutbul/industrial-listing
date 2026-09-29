// ייבוא מודעות פעילות מ-eBay ל-Postgres — קריאה בלבד מול eBay.
//
//   npm run job:import-ebay -- --dry-run      # מה ייובא, בלי לכתוב ל-DB (~34 קריאות לחנות של 6,600 מודעות)
//   npm run job:import-ebay                    # ייבוא (שלב 1: SKU + כמות + כותרת + מחיר)
//   npm run job:import-ebay -- --enrich=300   # שלב 2: פרטים מלאים (GetItem) ל-300 מוצרים — קריאה אחת לכל מוצר
//   npm run job:import-ebay -- --max-pages=1
//
// יוצא עם קוד 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת כבר פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const { importEbayListings, enrichProductDetails } = await import('@/lib/sync/import-ebay')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')

  try {
    const enrich = arg('enrich')
    const r = enrich
      ? await enrichProductDetails({ limit: Number(enrich) })
      : await importEbayListings({ dryRun: args.includes('--dry-run'), maxPages: arg('max-pages') ? Number(arg('max-pages')) : undefined })
    const { skipped, mismatches, generatedSkus, errors, ...summary } = r as unknown as Record<string, unknown[]>
    console.log(JSON.stringify({ ...summary, skipped: skipped?.length, mismatches: mismatches?.length, generatedSkus: generatedSkus?.length, errors }, null, 2))
    process.exitCode = (errors as unknown[])?.length ? 1 : 0
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
