// היסטוריית התנהלות של לקוחות מ-eBay → customer_cases + פרופיל קונה ב-customers. קריאה בלבד.
//
//   npm run job:customer-history                       # 90 ימים אחורה + עד 100 פרופילים
//   npm run job:customer-history -- --days=540         # השלמה אחורה (כמה אחורה eBay מחזיר — לא נבדק בחשבון)
//   npm run job:customer-history -- --profiles=0       # בלי פרופילים
//   npm run job:customer-history -- --no-cases         # רק פרופילים + קישור
//
// ביטולים והחזרים כספיים נקלטים גם ב-poll-ebay-orders. להשלמה אחורה שלהם: poll-ebay-orders -- --days=730
// יוצא עם 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const { fetchCustomerHistory } = await import('@/lib/customers/history')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')
  try {
    const profiles = arg('profiles')
    const r = await fetchCustomerHistory({ days: Number(arg('days')) || 90, profiles: profiles === undefined ? 100 : Number(profiles) || 0, skipCases: args.includes('--no-cases') })
    console.log(JSON.stringify(r, null, 2))
    process.exitCode = r.errors.length ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[customer-history] failed:', err instanceof Error ? err.message : err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
