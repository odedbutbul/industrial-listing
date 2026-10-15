// תמונות הגלריה מ-eBay → ספריית המדיה של החנות — תצוגה מקדימה בלבד (docs/gallery-media-plan.md).
// קריאה מהחנות (wc/v3 GET) + HEAD לתמונות ב-eBay. לא כותב לחנות, ל-eBay או ל-DB.
//
//   npm run job:woo-gallery                    # כל המוצרים שבחנות
//   npm run job:woo-gallery -- --limit=40      # רק 40 הראשונים
//   npm run job:woo-gallery -- --no-probe      # בלי בדיקת התמונות ב-eBay

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

async function main() {
  if (process.argv.includes('--apply')) {
    console.error('העלאה לחנות עוד לא קיימת — רק תצוגה מקדימה, עד אישור של עודד (docs/gallery-media-plan.md)')
    process.exitCode = 1
    return
  }
  const { planGallery, probeEbayImages } = await import('@/lib/sync/woo-gallery')
  const { pool } = await import('@/lib/db/client')
  try {
    const limit = arg('limit') ? Number(arg('limit')) : undefined
    const plan = await planGallery({ limit })
    const ps = plan.products
    const uploads = ps.flatMap((p) => p.upload)
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
      productsWithExistingWooGallery: ps.filter((p) => p.existingGalleryIds > 0).map((p) => p.wooProductId),
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
    console.error('[woo-gallery] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
