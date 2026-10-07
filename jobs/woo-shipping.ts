// מחיר, מחירי משלוח ומדיניות החזרות (מהמערכת, כפי שנמשכו מ-eBay) → מוצרים שכבר בחנות. רק מה שהשתנה.
//
//   npm run job:woo-shipping              # תצוגה מקדימה בלבד — קריאה מהחנות, בלי כתיבה
//   npm run job:woo-shipping -- --apply   # עדכון בחנות: regular_price ו/או שדות המשלוח (כל בוקר אחרי job:fetch-shipping — החלטת עודד 30/09/2026)
//
// יוצא עם קוד 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת כבר פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const apply = process.argv.includes('--apply')
  const { previewWooShipping, pushWooShipping } = await import('@/lib/sync/woo-shipping')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = apply ? await pushWooShipping() : await previewWooShipping()
    const { items, ...summary } = r as typeof r & { failed?: unknown[] }
    const sample = items.filter((i) => i.status !== 'same').slice(0, 8).map((i) => ({ sku: i.sku, woo: i.wooProductId, status: i.status, price: i.price, shipping: i.shipping ? { current: i.current, next: i.next } : null, returns: i.returns }))
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', ...summary, sample }, null, 2))
    process.exitCode = summary.failed?.length ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[woo-shipping] failed:', err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
