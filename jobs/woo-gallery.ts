// תמונות הגלריה מ-eBay → ספריית המדיה של החנות (docs/gallery-media-plan.md).
//
// תצוגה מקדימה (ברירת מחדל) — קריאה מהחנות (wc/v3 GET) + HEAD לתמונות ב-eBay. לא כותב לחנות, ל-eBay או ל-DB:
//   npm run job:woo-gallery                    # כל המוצרים שבחנות
//   npm run job:woo-gallery -- --limit=40      # רק 40 הראשונים
//   npm run job:woo-gallery -- --no-probe      # בלי בדיקת התמונות ב-eBay
//
// העלאה + החלפה בחנות — רק באישור עודד להרצה בייצור. חובה לבחור מוצרים:
//   npm run job:woo-gallery -- --apply --ids=15,17,34,40,52
//   npm run job:woo-gallery -- --apply --limit=100
//   npm run job:woo-gallery -- --apply --all
//
// יוצא עם קוד 0 בהצלחה, 1 בשגיאה / מוצר שנכשל, 2 אם ריצה אחרת כבר פעילה.

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

async function main() {
  const { applyGallery, planGallery, probeEbayImages } = await import('@/lib/sync/woo-gallery')
  const { JobLockedError } = await import('@/lib/sync/lock')
  const { pool } = await import('@/lib/db/client')
  const limit = arg('limit') ? Number(arg('limit')) : undefined
  const ids = arg('ids')
    ?.split(',')
    .map(Number)
    .filter((n) => n > 0)
  try {
    if (process.argv.includes('--apply')) {
      const r = await applyGallery({ ids, limit, all: process.argv.includes('--all'), onProgress: (phase, done, total) => process.stderr.write(`\r${phase} ${done}/${total}   `) })
      process.stderr.write('\n')
      const by = r.products.reduce<Record<string, number>>((a, p) => ((a[p.outcome] = (a[p.outcome] ?? 0) + 1), a), {})
      console.log(JSON.stringify({ mode: 'apply', runId: r.runId, outcomes: by, uploaded: r.uploaded, reused: r.reused, uploadFailed: r.uploadFailed, mb: Math.round(r.bytes / 10485.76) / 100, products: r.products }, null, 2))
      process.exitCode = r.products.some((p) => ['upload_failed', 'switch_failed', 'verify_failed'].includes(p.outcome)) ? 1 : 0
      return
    }
    const plan = await planGallery({ ids, limit })
    const ps = plan.products
    const uploads = ps.filter((p) => p.state === 'todo').flatMap((p) => p.upload)
    const unique = uploads.filter((u) => u.duplicateOf === null)
    const summary = {
      mode: 'preview',
      productsMapped: plan.productsMapped,
      productsInStore: plan.productsInStore,
      byStatus: ps.reduce<Record<string, number>>((a, p) => ((a[p.status] = (a[p.status] ?? 0) + 1), a), {}),
      productsWithGallery: ps.filter((p) => p.galleryUrls > 0).length,
      galleryUrls: ps.reduce((a, p) => a + p.galleryUrls, 0),
      hiddenNotUploaded: ps.reduce((a, p) => a + p.hidden, 0),
      unparsable: ps.reduce((a, p) => a + p.unparsable, 0),
      toUpload: unique.length,
      duplicatesReused: uploads.length - unique.length,
      altFromStore: uploads.filter((u) => u.altSource === 'store').length,
      byState: ps.reduce<Record<string, number>>((a, p) => ((a[p.state] = (a[p.state] ?? 0) + 1), a), {}),
      conflicts: ps.filter((p) => p.state === 'conflict').map((p) => p.wooProductId),
    }
    let probe: Awaited<ReturnType<typeof probeEbayImages>> | null = null
    if (!process.argv.includes('--no-probe')) probe = await probeEbayImages(unique.map((u) => u.ebayId))
    const avg = probe && probe.sized ? Math.round(probe.bytes / probe.sized) : null
    const sample = ps.filter((p) => p.upload.length).slice(0, 3).map((p) => ({ woo: p.wooProductId, slug: p.slug, files: p.upload.slice(0, 3).map((u) => ({ file: u.fileName, alt: u.alt, altSource: u.altSource })) }))
    console.log(
      JSON.stringify(
        {
          ...summary,
          ebay: probe && { ok: probe.ok, missing: probe.missing, failed: probe.failed, avgBytes: avg, estimatedOriginalsMB: avg ? Math.round((avg * unique.length) / 1048576) : null, missingSample: probe.missingIds.slice(0, 10) },
          sample,
        },
        null,
        2,
      ),
    )
  } catch (err) {
    if (err instanceof JobLockedError) {
      console.error(err.message)
      process.exitCode = 2
      return
    }
    console.error('[woo-gallery] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
