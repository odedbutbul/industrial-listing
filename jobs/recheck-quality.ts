// בדיקה חוזרת יומית של בדיקת המודעות: כל מוצר עם ממצא פתוח נקרא מחדש מ-eBay (GetItem, קריאה בלבד),
// ואז סריקה — מה שתוקן ב-eBay עובר ל"תוקנו" לבד. מוצר שבחנות ושהתוכן שלו השתנה — מתעדכן גם בחנות.
//
//   npm run job:recheck-quality
//   npm run job:recheck-quality -- --limit=20   # רק 20 מוצרים (בדיקה)

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

async function main() {
  const { recheckOpenIssues } = await import('@/lib/quality/recheck')
  const { pool } = await import('@/lib/db/client')
  try {
    const limit = arg('limit')
    const r = await recheckOpenIssues({ limit: limit ? Number(limit) : undefined })
    console.log(
      `נקראו מ-eBay ${r.refreshed}/${r.products} מוצרים (${r.errors} שגיאות) · ממצאים ${r.scan.found} · תוקנו ${r.scan.resolved} · חדשים ${r.scan.created} · חזרו ${r.scan.reopened} · בחנות: עודכנו ${r.store.updated}, נשארו עריכות ידניות ב-${r.store.keptEdits}, נכשלו ${r.store.failed} · ${r.durationMs}ms`,
    )
    if (r.errors || r.store.failed) process.exitCode = 1
  } catch (err) {
    console.error('[recheck-quality] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
