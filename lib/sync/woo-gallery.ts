import { and, eq, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { ebayImageId } from '@/lib/quality/checks'
import { wooGet } from '@/lib/woo/client'

// תמונות הגלריה (2 והלאה) מ-eBay → ספריית המדיה של החנות. היום ה-theme מציג אותן מ-i.ebayimg.com (meta `_sync_gallery`),
// כך שחיפוש תמונות מייחס אותן ל-eBay, והן נשברות כש-eBay מוחק אותן. התכנון המלא: docs/gallery-media-plan.md.
// כאן — תצוגה מקדימה בלבד (קריאה מהחנות + HEAD לתמונות ב-eBay). שום דבר לא נכתב, לא בחנות ולא ב-DB.

const READ_PAGE = 50
const FILENAME_MAX = 70
/** הגודל שיורד מ-eBay: 1600px ב-WebP — אותו קובץ שה-theme מציג היום כ-src */
export const ebayDownloadUrl = (id: string) => `https://i.ebayimg.com/images/g/${id}/s-l1600.webp`

type WooMeta = { key: string; value: unknown }
interface StoreProduct {
  id: number
  name: string
  slug: string
  status: string
  images: { id: number; src: string }[]
  meta_data: WooMeta[]
}

export interface GalleryImagePlan {
  ebayId: string
  position: number
  fileName: string
  alt: string
  altSource: 'store' | 'auto'
  /** אותה תמונה כבר מתוכננת למוצר אחר — לא מועלית שוב */
  duplicateOf: number | null
}

export interface GalleryProductPlan {
  wooProductId: number
  slug: string
  status: string
  galleryUrls: number
  hidden: number
  /** תמונות גלריה שכבר מחוברות למוצר ב-WooCommerce (ה-theme לא מציג אותן היום) */
  existingGalleryIds: number
  /** כתובות ב-_sync_gallery שאינן של eBay / בלי מזהה תמונה */
  unparsable: number
  upload: GalleryImagePlan[]
}

const slugify = (t: string) =>
  t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** שם קובץ באנגלית מתוך ה-slug של המוצר (נוקה כבר בחנות) + מיקום התמונה: `lumenis-resurfx-handpiece-2.webp` */
export function galleryFileName(slug: string, name: string, position: number): string {
  let base = slugify(decodeURIComponent(slug)) || slugify(name) || 'product'
  if (base.length > FILENAME_MAX) base = base.slice(0, FILENAME_MAX).replace(/-[^-]*$/, '') || base.slice(0, FILENAME_MAX)
  return `${base}-${position}.webp`
}

const decodeEntities = (t: string) => t.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')

function metaMap(meta: WooMeta[], key: string): Record<string, string> {
  const v = meta.find((m) => m.key === key)?.value
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : {}
}
function metaList(meta: WooMeta[], key: string): string[] {
  const v = meta.find((m) => m.key === key)?.value
  return Array.isArray(v) ? v.map(String) : v && typeof v === 'object' ? Object.values(v).map(String) : []
}

export async function planGallery(opts: { limit?: number; onProgress?: (done: number, total: number) => void } = {}) {
  const rows = await db
    .select({ wooProductId: schema.channelMappings.wooProductId })
    .from(schema.channelMappings)
    .innerJoin(schema.products, eq(schema.products.id, schema.channelMappings.productId))
    .where(and(isNotNull(schema.channelMappings.wooProductId), eq(schema.products.archived, false)))
    .orderBy(schema.channelMappings.wooProductId)
  const ids = rows.map((r) => r.wooProductId!).slice(0, opts.limit ?? rows.length)

  const store: StoreProduct[] = []
  for (let i = 0; i < ids.length; i += READ_PAGE) {
    const { data } = await wooGet<StoreProduct[]>('products', {
      include: ids.slice(i, i + READ_PAGE).join(','),
      per_page: READ_PAGE,
      status: 'any',
      context: 'edit',
      _fields: 'id,name,slug,status,images,meta_data',
    })
    store.push(...data)
    opts.onProgress?.(Math.min(i + READ_PAGE, ids.length), ids.length)
  }

  const firstUse = new Map<string, number>()
  const products: GalleryProductPlan[] = []
  for (const p of store.sort((a, b) => a.id - b.id)) {
    let urls: unknown = []
    try {
      urls = JSON.parse(String(p.meta_data.find((m) => m.key === '_sync_gallery')?.value ?? '[]'))
    } catch {
      urls = []
    }
    const list = Array.isArray(urls) ? urls.map(String) : []
    const alts = metaMap(p.meta_data, '_vz_img_alt')
    const hidden = new Set(metaList(p.meta_data, '_vz_img_hidden'))
    const name = decodeEntities(p.name)
    const plan: GalleryProductPlan = { wooProductId: p.id, slug: p.slug, status: p.status, galleryUrls: list.length, hidden: 0, existingGalleryIds: Math.max(p.images.length - 1, 0), unparsable: 0, upload: [] }
    // מיקום כמו בעמוד: 1 = התמונה הראשית (כבר בספרייה), הגלריה מ-2
    const total = list.length + (p.images.length ? 1 : 0)
    let position = p.images.length ? 1 : 0
    for (const url of list) {
      position++
      const id = url.startsWith('https://i.ebayimg.com/') ? ebayImageId(url) : null
      if (!id) {
        plan.unparsable++
        continue
      }
      // תמונה מוסתרת (בדרך כלל תווית המחסן) — לא עולה לאתר. נשארת ב-_sync_gallery כמו היום
      if (hidden.has(id)) {
        plan.hidden++
        continue
      }
      const dup = firstUse.get(id) ?? null
      if (dup === null) firstUse.set(id, p.id)
      plan.upload.push({
        ebayId: id,
        position,
        fileName: galleryFileName(p.slug, name, position),
        alt: alts[id] ?? `${name} — photo ${position} of ${total}`,
        altSource: alts[id] ? 'store' : 'auto',
        duplicateOf: dup,
      })
    }
    products.push(plan)
  }
  return { productsInStore: store.length, productsMapped: ids.length, products }
}

/** HEAD לתמונות ב-eBay: כמה קיימות, כמה כבר נמחקו, ומשקל ממוצע (לחישוב נפח). קריאה בלבד מה-CDN, לא מה-API. */
export async function probeEbayImages(ids: string[], concurrency = 6) {
  const out = { ok: 0, missing: 0, failed: 0, bytes: 0, sized: 0, missingIds: [] as string[] }
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      try {
        const res = await fetch(ebayDownloadUrl(id), { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
        if (res.ok) {
          out.ok++
          const len = Number(res.headers.get('content-length'))
          if (len > 0) {
            out.bytes += len
            out.sized++
          }
        } else if (res.status === 404 || res.status === 410) {
          out.missing++
          out.missingIds.push(id)
        } else out.failed++
      } catch {
        out.failed++
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return out
}
