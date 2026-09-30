// השוואת מחירים מול מתחרים ב-eBay (Browse API) — קריאה בלבד מול eBay.
//
//   npm run job:check-prices -- --dry-run              # פיילוט: 20 מוצרים ממותגים שונים, בלי לכתוב ל-DB
//   npm run job:check-prices -- --limit=5
//   npm run job:check-prices -- --all --limit=4500     # כל הקטלוג, קודם מה שלא נבדק / הכי ישן (מכסת eBay: 5,000 ביום)
//   npm run job:check-prices -- --skus=ABC123,XYZ9     # מוצרים מסוימים
//   npm run job:check-prices -- --countries=US,AU,GB   # מדינות הקונה (ברירת מחדל US) — מחיר כולל משלוח עד אליו
//   npm run job:check-prices -- --json                 # פלט מלא (כולל כל המודעות)
//
// קריאה אחת ל-eBay לכל מוצר × מדינה (חיפוש); המשלוח שלנו נלקח מהמערכת, ורק אם אין — קריאה שנייה.
// ריצה של יותר מ-30 בדיקות מדפיסה סיכום בלבד (הפירוט במסך /sync/pricing). יוצא עם קוד 0 בהצלחה, 1 בשגיאה, 2 אם ריצה אחרת כבר פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const { runPriceCheck } = await import('@/lib/pricing/check')
  const { CONDITION_LABEL, POSITION_LABEL } = await import('@/lib/pricing/match')
  const { sellerItemsUrl } = await import('@/lib/ebay/browse')
  const { totalPrice } = await import('@/lib/pricing/match')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')

  try {
    const all = args.includes('--all')
    const r = await runPriceCheck({
      all,
      lean: all,
      dryRun: args.includes('--dry-run'),
      limit: arg('limit') ? Number(arg('limit')) : undefined,
      countries: arg('countries')?.split(','),
      skus: arg('skus')?.split(',').map((s) => s.trim()).filter(Boolean),
    })

    if (args.includes('--json')) {
      console.log(JSON.stringify(r, null, 2))
    } else if (r.checks.length > 30) {
      const by: Record<string, number> = {}
      for (const c of r.checks) by[c.error ? 'error' : c.stats.position] = (by[c.error ? 'error' : c.stats.position] ?? 0) + 1
      console.log(`run ${r.runId}${r.dryRun ? ' (dry-run, לא נשמר)' : ''} · ${r.products} מוצרים × ${r.countries.join('/')} · ${r.apiCalls} קריאות eBay · משלוח שלנו מהמערכת ${r.shippingReused} · ${r.errors} שגיאות${r.rateLimited ? ' · נעצר: מכסת eBay' : ''}${r.budgetReached ? ' · נעצר בתקציב הקריאות, השאר בריצה הבאה' : ''}`)
      console.log(`עם מתחרים להשוואה: ${r.withCompetitors}`)
      for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k === 'error' ? 'שגיאה' : POSITION_LABEL[k as keyof typeof POSITION_LABEL] ?? k}: ${v}`)
      const errs = r.checks.filter((c) => c.error).slice(0, 5)
      for (const c of errs) console.log(`  ! ${c.sku}: ${c.error}`)
      console.log('\nמוכרים שחוזרים הכי הרבה:')
      for (const s of r.topSellers.slice(0, 15)) console.log(`  ${s.seller}: ${s.products} מוצרים · ${sellerItemsUrl(s.seller)}`)
      if (r.skipped.length) console.log(`\nדולגו ${r.skipped.length}`)
    } else {
      const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`)
      const money = (v: number | null) => (v == null ? '—' : `$${v}`)
      console.log(`run ${r.runId}${r.dryRun ? ' (dry-run, לא נשמר)' : ''} · ${r.products} מוצרים × ${r.countries.join('/')} · ${r.apiCalls} קריאות eBay · ${r.errors} שגיאות · ${r.withCompetitors} עם מתחרים להשוואה`)
      for (const c of r.checks) {
        const levels = { exact: 0, likely: 0, weak: 0 }
        for (const o of c.offers) levels[o.match.level]++
        console.log(
          [
            `\n• [${c.country}] ${c.sku} | ${c.brand ?? ''} ${c.mpn} | ${CONDITION_LABEL[c.group]} | שלנו ${money(c.ourPrice)} + ${c.ourShipping != null ? `${money(c.ourShipping)} משלוח` : 'משלוח לא ידוע'}`,
            `  eBay מצא ${c.totalResults} · התאמה מלאה ${levels.exact} · סבירה ${levels.likely} · חלשה ${levels.weak} · בהשוואה ${c.item.count}`,
            c.error
              ? `  שגיאה: ${c.error}`
              : `  מחיר פריט: מינ׳ ${money(c.item.min)} · חציון ${money(c.item.median)} · מקס׳ ${money(c.item.max)} → ${POSITION_LABEL[c.item.position]} (מול חציון ${pct(c.item.vsMedianPct)}, מול הזול ${pct(c.item.vsMinPct)})`,
            c.total.count
              ? `  כולל משלוח עד הקונה (${c.total.count} מודעות): מינ׳ ${money(c.total.min)} · חציון ${money(c.total.median)} → ${POSITION_LABEL[c.total.position]} (מול חציון ${pct(c.total.vsMedianPct)}, מול הזול ${pct(c.total.vsMinPct)})`
              : '  כולל משלוח: אין מספיק נתוני משלוח להשוואה',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        // מהזול ליקר (כולל משלוח כשידוע), עם קישור למודעה ולכל המודעות של המוכר
        const sortKey = (o: (typeof c.offers)[number]) => totalPrice(o.item.price, o.item.shipping) ?? Number(o.item.price)
        for (const o of c.offers.filter((o) => o.compared).sort((a, b) => sortKey(a) - sortKey(b)).slice(0, 10)) {
          console.log(`    - ${o.item.seller} (${o.item.country ?? '?'}) · $${o.item.price}${o.item.shipping != null ? ` + $${o.item.shipping}` : ' + משלוח ?'} · ${o.item.condition ?? ''} · ${o.item.title.slice(0, 60)}`)
          console.log(`      מודעה: ${o.item.url ?? '—'}${o.item.seller ? `\n      המוכר: ${sellerItemsUrl(o.item.seller)}` : ''}`)
        }
      }
      console.log('\nמוכרים שחוזרים הכי הרבה (התאמה מלאה/סבירה):')
      for (const s of r.topSellers.slice(0, 15)) console.log(`  ${s.seller}: ${s.products} מוצרים, ${s.offers} מודעות · ${sellerItemsUrl(s.seller)}`)
      if (r.skipped.length) console.log(`\nדולגו ${r.skipped.length}: ${r.skipped.map((s) => `${s.sku} (${s.reason})`).join(', ')}`)
    }
    process.exitCode = r.errors || r.rateLimited ? 1 : 0
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
    } else {
      console.error('[check-prices] failed:', err)
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main()
