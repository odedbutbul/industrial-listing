// בדיקת איכות המודעות (שכבה 1, בלי AI): תמונות משותפות, כותרת מול תיאור ופרטים. קורא רק מה-DB.
//
//   npm run job:scan-quality

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const { scanListingQuality } = await import('@/lib/quality/scan')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = await scanListingQuality()
    console.log(`נסרקו ${r.products} מוצרים · ${r.found} ממצאים · חדשים ${r.created} · תוקנו ${r.resolved} · חזרו ${r.reopened} · ${r.durationMs}ms`)
  } catch (err) {
    console.error('[scan-quality] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
