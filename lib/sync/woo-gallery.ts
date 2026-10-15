import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { ebayImageId } from '@/lib/quality/checks'
import { WooApiError, wooGet, wooRequest } from '@/lib/woo/client'
import { missingWooEnv } from '@/lib/woo/config'
import { missingWpMediaEnv, uploadWpMedia, WpMediaError } from '@/lib/woo/wp-media'
import { withJobLock } from './lock'
import { writeSyncLog } from './log'

// תמונות הגלריה (2 והלאה) מ-eBay → ספריית המדיה של החנות. עד עכשיו ה-theme הציג אותן מ-i.ebayimg.com (meta `_sync_gallery`),
// כך שחיפוש תמונות ייחס אותן ל-eBay, והן נשברות כש-eBay מוחק אותן. התכנון המלא: docs/gallery-media-plan.md (אושר ע"י עודד 15/10/2026).
//
// שני שלבים, כדי שקאש העמודים בחנות יתנקה כמה שפחות:
// 1. העלאה (wp/v2/media) של כל התמונות של המוצרים שנבחרו. העלאת קובץ לא שומרת את המוצר, ולכן לא מנקה את הקאש.
//    תמונה שכבר עלתה (טבלת woo_media, גם ממוצר אחר) לא עולה שוב. מוסתרות (`_vz_img_hidden`, תווית המחסן) לא עולות בכלל.
// 2. החלפה: עדכון אחד לכל מוצר שכל התמונות שלו עלו — `images` (הראשית + הקבצים לפי הסדר ב-eBay), `_sync_gallery` = רק מה שלא עלה,
//    מפתחות alt `a<id>` נוספים ל-`_vz_img_alt` (הישנים נשארים), `_sync_gallery_media` = מה שהסנכרון חיבר. אחר כך קריאה חוזרת לאימות.
// לא נמחק כלום בחנות. מוצר שכבר יש לו גלריה ב-WooCommerce שהסנכרון לא חיבר — לא נוגעים ומדווחים.

export const WOO_GALLERY_JOB = 'woo_gallery'
export const GALLERY_MEDIA_META = '_sync_gallery_media'
const READ_PAGE = 50
const WRITE_BATCH = 10
const FILENAME_MAX = 70
const MAX_BYTES = 15 * 1024 * 1024
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
  /** הכתובת כפי שהיא ב-_sync_gallery */
  url: string
  position: number
  fileName: string
  alt: string
  altSource: 'store' | 'auto'
  /** אותה תמונה כבר מתוכננת למוצר אחר בריצה הזו — לא מועלית שוב */
  duplicateOf: number | null
}

export type GalleryProductState = 'todo' | 'done' | 'no_gallery' | 'conflict'

export interface GalleryProductPlan {
  wooProductId: number
  slug: string
  status: string
  state: GalleryProductState
  mainImageId: number | null
  galleryUrls: number
  hidden: number
  /** תמונות גלריה שכבר מחוברות למוצר ב-WooCommerce */
  existingGalleryIds: number
  /** כתובות ב-_sync_gallery שאינן של eBay / בלי מזהה תמונה — נשארות כמו שהן */
  unparsable: number
  upload: GalleryImagePlan[]
  /** מה שנשאר ב-_sync_gallery אחרי ההחלפה (מוסתרות + לא מזוהות), לפי הסדר */
  keepUrls: string[]
  /** _vz_img_alt כפי שהוא בחנות (null = אין שדה) */
  alts: Record<string, string> | null
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
export function galleryFileName(slug: string, name: string, position: number, ext = 'webp'): string {
  let safe = slug
  try {
    safe = decodeURIComponent(slug)
  } catch {
    // slug עם % שאינו קידוד — משתמשים בו כמו שהוא
  }
  let base = slugify(safe) || slugify(name) || 'product'
  if (base.length > FILENAME_MAX) base = base.slice(0, FILENAME_MAX).replace(/-[^-]*$/, '') || base.slice(0, FILENAME_MAX)
  return `${base}-${position}.${ext}`
}

const decodeEntities = (t: string) => t.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')

function metaValue(meta: WooMeta[], key: string): unknown {
  return meta.find((m) => m.key === key)?.value
}
function metaMap(meta: WooMeta[], key: string): Record<string, string> | null {
  const v = metaValue(meta, key)
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : null
}
function metaList(meta: WooMeta[], key: string): string[] {
  const v = metaValue(meta, key)
  return Array.isArray(v) ? v.map(String) : v && typeof v === 'object' ? Object.values(v).map(String) : []
}
function parseJsonList(v: unknown): unknown[] {
  try {
    const x = typeof v === 'string' ? JSON.parse(v || '[]') : v
    return Array.isArray(x) ? x : []
  } catch {
    return []
  }
}

/** מה שהסנכרון חיבר בפעם האחרונה (`_sync_gallery_media`): [{ebayId, attachmentId}] */
export function galleryMediaOf(meta: WooMeta[]): { ebayId: string; attachmentId: number }[] {
  return parseJsonList(metaValue(meta, GALLERY_MEDIA_META))
    .map((x) => x as { ebayId?: unknown; attachmentId?: unknown })
    .filter((x) => typeof x.ebayId === 'string' && Number(x.attachmentId) > 0)
    .map((x) => ({ ebayId: x.ebayId as string, attachmentId: Number(x.attachmentId) }))
}

/** תוכנית למוצר אחד, מתוך המוצר כפי שהוא בחנות */
export function planProduct(p: StoreProduct, firstUse = new Map<string, number>()): GalleryProductPlan {
  const list = parseJsonList(metaValue(p.meta_data, '_sync_gallery')).map(String)
  const alts = metaMap(p.meta_data, '_vz_img_alt')
  const hidden = new Set(metaList(p.meta_data, '_vz_img_hidden'))
  const name = decodeEntities(p.name)
  const mainImageId = p.images[0]?.id ?? null
  const plan: GalleryProductPlan = {
    wooProductId: p.id,
    slug: p.slug,
    status: p.status,
    state: 'todo',
    mainImageId,
    galleryUrls: list.length,
    hidden: 0,
    existingGalleryIds: Math.max(p.images.length - 1, 0),
    unparsable: 0,
    upload: [],
    keepUrls: [],
    alts,
  }
  // מיקום כמו בעמוד: 1 = התמונה הראשית (כבר בספרייה), הגלריה מ-2
  const total = list.length + (mainImageId ? 1 : 0)
  let position = mainImageId ? 1 : 0
  for (const url of list) {
    position++
    const id = url.startsWith('https://i.ebayimg.com/') ? ebayImageId(url) : null
    if (!id) {
      plan.unparsable++
      plan.keepUrls.push(url)
      continue
    }
    if (hidden.has(id)) {
      plan.hidden++
      plan.keepUrls.push(url)
      continue
    }
    const dup = firstUse.get(id) ?? null
    if (dup === null) firstUse.set(id, p.id)
    plan.upload.push({
      ebayId: id,
      url,
      position,
      fileName: galleryFileName(p.slug, name, position),
      alt: alts?.[id] ?? `${name} — photo ${position} of ${total}`,
      altSource: alts?.[id] ? 'store' : 'auto',
      duplicateOf: dup,
    })
  }
  if (galleryMediaOf(p.meta_data).length) plan.state = 'done'
  else if (plan.existingGalleryIds > 0) plan.state = 'conflict'
  else if (!plan.upload.length) plan.state = 'no_gallery'
  return plan
}

async function readStore(ids: number[], onProgress?: (done: number, total: number) => void): Promise<StoreProduct[]> {
  const out: StoreProduct[] = []
  for (let i = 0; i < ids.length; i += READ_PAGE) {
    const { data } = await wooGet<StoreProduct[]>('products', {
      include: ids.slice(i, i + READ_PAGE).join(','),
      per_page: READ_PAGE,
      status: 'any',
      context: 'edit',
      _fields: 'id,name,slug,status,images,meta_data',
    })
    out.push(...data)
    onProgress?.(Math.min(i + READ_PAGE, ids.length), ids.length)
  }
  return out.sort((a, b) => a.id - b.id)
}

/** המוצרים שבחנות לפי המערכת (לא בארכיון), בסדר id. ids = רק אלה. */
async function storeIds(opts: { ids?: number[]; limit?: number }): Promise<number[]> {
  const rows = await db
    .select({ wooProductId: schema.channelMappings.wooProductId })
    .from(schema.channelMappings)
    .innerJoin(schema.products, eq(schema.products.id, schema.channelMappings.productId))
    .where(and(isNotNull(schema.channelMappings.wooProductId), eq(schema.products.archived, false), opts.ids?.length ? inArray(schema.channelMappings.wooProductId, opts.ids) : undefined))
    .orderBy(schema.channelMappings.wooProductId)
  const ids = rows.map((r) => r.wooProductId!)
  return opts.limit ? ids.slice(0, opts.limit) : ids
}

export async function planGallery(opts: { ids?: number[]; limit?: number; onProgress?: (done: number, total: number) => void } = {}) {
  const ids = await storeIds(opts)
  const store = await readStore(ids, opts.onProgress)
  const firstUse = new Map<string, number>()
  const products = store.map((p) => planProduct(p, firstUse))
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

// ── העלאה והחלפה ─────────────────────────────────────────────────────────────

class DownloadError extends Error {}

const MIME_EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }

/** WebP 1600 מ-eBay; אם לא קיים — הכתובת המקורית שב-_sync_gallery. רק תמונה, עד 15MB. */
async function downloadImage(img: GalleryImagePlan): Promise<{ data: Buffer; mime: string; source: string }> {
  let last = ''
  for (const source of [ebayDownloadUrl(img.ebayId), img.url]) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(30_000) })
      const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!res.ok || !MIME_EXT[mime]) {
        last = `${res.status} ${mime || 'no content-type'}`
        continue
      }
      const data = Buffer.from(await res.arrayBuffer())
      if (!data.length || data.length > MAX_BYTES) {
        last = `size ${data.length}`
        continue
      }
      return { data, mime, source }
    } catch (e) {
      last = e instanceof Error ? e.message : 'network'
    }
  }
  throw new DownloadError(`הורדת התמונה מ-eBay נכשלה (${last})`)
}

export type GalleryProductOutcome = 'switched' | 'done' | 'no_gallery' | 'conflict' | 'upload_failed' | 'switch_failed' | 'verify_failed'

export interface GalleryRunResult {
  runId: string
  products: { wooProductId: number; outcome: GalleryProductOutcome; uploaded: number; reused: number; attachments: number[]; error?: string }[]
  uploaded: number
  reused: number
  uploadFailed: number
  bytes: number
}

/**
 * מעלה את תמונות הגלריה של המוצרים שנבחרו ומחליף אותם לקבצים בספרייה. ids / limit חובה — אין "הכל" בטעות.
 * ריצה אחת בכל פעם (advisory lock). כל כשל נרשם ב-sync_log; מוצר שתמונה שלו לא עלתה — לא מוחלף בריצה הזו.
 */
export async function applyGallery(opts: { ids?: number[]; limit?: number; all?: boolean; onProgress?: (phase: string, done: number, total: number) => void }): Promise<GalleryRunResult> {
  if (!opts.all && !opts.ids?.length && !opts.limit) throw new Error('צריך לבחור מוצרים (ids / limit) או all במפורש')
  const missing = [...missingWooEnv(), ...missingWpMediaEnv()]
  if (missing.length) throw new Error(`חסרים בשרת: ${missing.join(', ')}`)

  return withJobLock(WOO_GALLERY_JOB, async () => {
    const runId = randomUUID()
    const started = Date.now()
    const plan = await planGallery({ ids: opts.ids, limit: opts.all ? undefined : opts.limit })
    const result: GalleryRunResult = { runId, products: [], uploaded: 0, reused: 0, uploadFailed: 0, bytes: 0 }
    const todo = plan.products.filter((p) => p.state === 'todo')
    for (const p of plan.products.filter((x) => x.state !== 'todo')) {
      result.products.push({ wooProductId: p.wooProductId, outcome: p.state as GalleryProductOutcome, uploaded: 0, reused: 0, attachments: [] })
      if (p.state === 'conflict')
        await writeSyncLog({ runId, job: WOO_GALLERY_JOB, channel: 'woo', action: 'switch_gallery', success: false, error: 'למוצר כבר יש גלריה בחנות שהסנכרון לא חיבר — לא נוגעים', details: { wooProductId: p.wooProductId, existingGalleryIds: p.existingGalleryIds } })
    }

    // ── שלב 1: העלאה. מה שכבר בספרייה (woo_media) — שימוש חוזר ──
    const wanted = Array.from(new Set(todo.flatMap((p) => p.upload.map((u) => u.ebayId))))
    const known = new Map<string, number>()
    for (let i = 0; i < wanted.length; i += 500) {
      const rows = await db.select({ e: schema.wooMedia.ebayImageId, a: schema.wooMedia.wooAttachmentId }).from(schema.wooMedia).where(inArray(schema.wooMedia.ebayImageId, wanted.slice(i, i + 500)))
      for (const r of rows) known.set(r.e, r.a)
    }
    const perProduct = new Map<number, { uploaded: number; reused: number; error?: string }>()
    const totalUploads = todo.reduce((a, p) => a + p.upload.filter((u) => !known.has(u.ebayId)).length, 0)
    let done = 0
    for (const p of todo) {
      const stat = { uploaded: 0, reused: 0 } as { uploaded: number; reused: number; error?: string }
      perProduct.set(p.wooProductId, stat)
      for (const img of p.upload) {
        if (known.has(img.ebayId)) {
          stat.reused++
          result.reused++
          continue
        }
        try {
          const file = await downloadImage(img)
          const fileName = file.mime === 'image/webp' ? img.fileName : img.fileName.replace(/\.webp$/, `.${MIME_EXT[file.mime]}`)
          const media = await uploadWpMedia(file.data, fileName, file.mime, img.alt)
          // מיד אחרי ההעלאה — כדי שריצה שנקטעה לא תעלה שוב
          await db.insert(schema.wooMedia).values({ ebayImageId: img.ebayId, wooAttachmentId: media.id, sourceUrl: media.source_url, fileName, wooProductId: p.wooProductId, bytes: file.data.length }).onConflictDoNothing()
          known.set(img.ebayId, media.id)
          stat.uploaded++
          result.uploaded++
          result.bytes += file.data.length
        } catch (e) {
          const error = e instanceof WpMediaError || e instanceof DownloadError ? e.message : e instanceof Error ? e.message : 'שגיאה בהעלאה'
          stat.error ??= error
          result.uploadFailed++
          await writeSyncLog({ runId, job: WOO_GALLERY_JOB, channel: 'woo', action: 'upload_image', success: false, error, details: { wooProductId: p.wooProductId, ebayImageId: img.ebayId, fileName: img.fileName } })
          // החנות לא זמינה / אין הרשאה — אין טעם להמשיך להעלות
          if (e instanceof WpMediaError && [0, 401, 403].includes(e.status)) throw e
        }
        opts.onProgress?.('upload', ++done, totalUploads)
      }
    }

    // ── שלב 2: החלפה, ברצף אחד ──
    const ready = todo.filter((p) => !perProduct.get(p.wooProductId)!.error)
    for (const p of todo.filter((x) => perProduct.get(x.wooProductId)!.error)) {
      const s = perProduct.get(p.wooProductId)!
      result.products.push({ wooProductId: p.wooProductId, outcome: 'upload_failed', uploaded: s.uploaded, reused: s.reused, attachments: [], error: s.error })
    }
    const bodies = ready.map((p) => ({ p, body: switchBody(p, known) }))
    for (let i = 0; i < bodies.length; i += WRITE_BATCH) {
      const chunk = bodies.slice(i, i + WRITE_BATCH)
      let res: ({ id?: number; error?: { message?: string } } | undefined)[]
      try {
        const r = await wooRequest<{ update?: { id?: number; error?: { message?: string } }[] }>('POST', 'products/batch', { body: { update: chunk.map((c) => c.body) }, timeoutMs: 120_000 })
        res = r.data.update ?? []
      } catch (e) {
        const msg = e instanceof WooApiError ? e.message : 'שגיאה לא צפויה בעדכון המוצרים'
        res = chunk.map(() => ({ error: { message: msg } }))
      }
      // קריאה חוזרת: הגלריה בחנות = מה שנשלח
      const okIds = chunk.filter((_, j) => res[j]?.id && !res[j]?.error).map((c) => c.p.wooProductId)
      const after = new Map((okIds.length ? await readStore(okIds) : []).map((w) => [w.id, w]))
      for (let j = 0; j < chunk.length; j++) {
        const { p, body } = chunk[j]
        const s = perProduct.get(p.wooProductId)!
        const attachments = body.images.slice(p.mainImageId ? 1 : 0).map((x) => x.id)
        let outcome: GalleryProductOutcome = 'switched'
        let error: string | undefined
        if (!res[j]?.id || res[j]?.error) {
          outcome = 'switch_failed'
          error = res[j]?.error?.message ?? 'החנות לא אישרה את העדכון'
        } else {
          const w = after.get(p.wooProductId)
          const got = w?.images.map((x) => x.id) ?? []
          const keep = w ? parseJsonList(metaValue(w.meta_data, '_sync_gallery')).map(String) : []
          if (JSON.stringify(got) !== JSON.stringify(body.images.map((x) => x.id)) || JSON.stringify(keep) !== JSON.stringify(p.keepUrls)) {
            outcome = 'verify_failed'
            error = `בחנות אחרי העדכון: ${got.length} תמונות במקום ${body.images.length}`
          }
        }
        result.products.push({ wooProductId: p.wooProductId, outcome, uploaded: s.uploaded, reused: s.reused, attachments, error })
        opts.onProgress?.('switch', i + j + 1, bodies.length)
      }
    }

    result.products.sort((a, b) => a.wooProductId - b.wooProductId)
    await writeSyncLog(
      result.products
        .filter((r) => ['switched', 'switch_failed', 'verify_failed', 'upload_failed'].includes(r.outcome))
        .map((r) => ({ runId, job: WOO_GALLERY_JOB, channel: 'woo' as const, action: 'switch_gallery', success: r.outcome === 'switched', error: r.error ?? null, details: { wooProductId: r.wooProductId, outcome: r.outcome, uploaded: r.uploaded, reused: r.reused, attachments: r.attachments } })),
    )
    const count = (o: GalleryProductOutcome) => result.products.filter((r) => r.outcome === o).length
    await writeSyncLog({
      runId,
      job: WOO_GALLERY_JOB,
      channel: 'woo',
      action: 'run',
      success: !result.products.some((r) => ['switch_failed', 'verify_failed', 'upload_failed'].includes(r.outcome)),
      details: { products: result.products.length, switched: count('switched'), alreadyDone: count('done'), noGallery: count('no_gallery'), conflict: count('conflict'), uploadFailed: count('upload_failed'), switchFailed: count('switch_failed'), verifyFailed: count('verify_failed'), images: result.uploaded, reused: result.reused, bytes: result.bytes },
      durationMs: Date.now() - started,
    })
    return result
  })
}

/** גוף העדכון של מוצר אחד (wc/v3 batch update) */
export function switchBody(p: GalleryProductPlan, attachmentOf: Map<string, number>) {
  const media = p.upload.map((u) => ({ ebayId: u.ebayId, attachmentId: attachmentOf.get(u.ebayId)! }))
  const meta: { key: string; value: unknown }[] = [
    { key: '_sync_gallery', value: JSON.stringify(p.keepUrls) },
    { key: GALLERY_MEDIA_META, value: JSON.stringify(media) },
    { key: '_sync_updated_at', value: new Date().toISOString() },
  ]
  // alt שנכתב בחנות לתמונה מ-eBay → גם תחת המפתח של הקובץ (a<id>), שה-theme קורא. המפתחות הישנים נשארים
  if (p.alts) {
    const next = { ...p.alts }
    for (const m of media) if (p.alts[m.ebayId] !== undefined) next[`a${m.attachmentId}`] = p.alts[m.ebayId]
    meta.push({ key: '_vz_img_alt', value: next })
  }
  return {
    id: p.wooProductId,
    images: [...(p.mainImageId ? [{ id: p.mainImageId }] : []), ...media.map((m) => ({ id: m.attachmentId }))],
    meta_data: meta,
  }
}
