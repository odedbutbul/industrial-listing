// קריאת תוויות המחסן מתמונות המוצרים בעזרת Gemini → label_reads. קריאה בלבד מול eBay (רק תמונות מה-CDN).
// עולה כסף: נעצר בתקרה (GEMINI_MAX_USD_PER_RUN, או --max-usd נמוך ממנה). מוצר שהתמונות שלו לא השתנו — לא נשלח שוב.
// אחרי הקריאה מריץ את בדיקת המודעות, כדי שממצאי "תווית של מוצר אחר" יופיעו במסך.
//
//   npm run job:read-labels -- --limit=100 --random --max-usd=0.5

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const { readLabels } = await import('@/lib/quality/labels')
  const { scanListingQuality } = await import('@/lib/quality/scan')
  const { pool } = await import('@/lib/db/client')
  try {
    const r = await readLabels({
      limit: Number(arg('limit')) || undefined,
      maxUsd: Number(arg('max-usd')) || undefined,
      random: args.includes('--random'),
      onProgress: (d, t) => d % 25 === 0 && console.log(`  ${d}/${t}`),
    })
    console.log(
      `${r.model} · ממתינים ${r.candidates} · נקראו ${r.read} · עם תווית ${r.withLabel} · שגיאות ${r.errors} · $${r.costUsd.toFixed(4)} (תקרה $${r.maxUsd}) · טוקנים ${r.inputTokens}/${r.outputTokens} · ${Math.round(r.durationMs / 1000)}s${r.stoppedByBudget ? ' · נעצר בתקרה' : ''}`,
    )
    const s = await scanListingQuality()
    console.log(`בדיקת מודעות: ${s.found} ממצאים · חדשים ${s.created}`)
  } catch (err) {
    console.error('[read-labels] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
