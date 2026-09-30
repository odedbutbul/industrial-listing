// בדיקת הצעת לקוח מהשורה — אותו דבר כמו המסך /sync/pricing/quote. חיפוש אחד ב-eBay (GET).
//
//   npm run job:quote-check -- --mpn=08279675 --brand="SEW EURODRIVE" --condition=used --offer=450 [--country=US]
//
// condition: any | new | refurbished | used | parts. יוצא עם 0 בהצלחה, 1 בשגיאה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const { checkQuote } = await import('@/lib/pricing/quote')
  const { POSITION_LABEL } = await import('@/lib/pricing/match')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = await checkQuote({
      mpn: arg('mpn') ?? '',
      brand: arg('brand') ?? null,
      condition: (arg('condition') as never) ?? 'any',
      offer: arg('offer') ? Number(arg('offer')) : null,
      country: arg('country') ?? 'US',
    })
    const m = r.market
    console.log(`${r.mpn} · ${r.condition} · ${r.country} · הצעה ${r.offer ?? '—'} · eBay מצא ${r.totalResults} · בהשוואה ${m.count}`)
    console.log(`שוק: מינ׳ ${m.min ?? '—'} · חציון ${m.median ?? '—'} · מקס׳ ${m.max ?? '—'} → ${POSITION_LABEL[m.position]} (מול חציון ${m.vsMedianPct ?? '—'}%, מול הזול ${m.vsMinPct ?? '—'}%)`)
    console.log(`בקטלוג: ${r.ours.map((o) => `${o.sku} $${o.price}`).join(', ') || 'לא'}${r.vsOursPct != null ? ` · הצעה מול המחיר שלנו ${r.vsOursPct}%` : ''}`)
    for (const o of r.offers.filter((o) => o.matchLevel !== 'weak'))
      console.log(`  ${o.compared ? '✓' : '·'} ${o.seller} $${o.price}${o.shipping != null ? ` + $${o.shipping}` : ''} · ${o.matchLevel}${o.excludeReason ? ` (${o.excludeReason})` : ''} · ${o.url}`)
    console.log(`  (+${r.offers.filter((o) => o.matchLevel === 'weak').length} התאמות חלשות)`)
  } catch (err) {
    console.error('[quote-check] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
