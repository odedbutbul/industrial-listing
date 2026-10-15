// בדיקה מקומית ל-lib/sync/woo-gallery.ts + עדכון הגלריה ב-lib/sync/woo-content.ts — חנות מדומה ותמונות eBay מדומות (fetch מוחלף).
// לא פונה לחנות, ל-eBay או ל-DB בייצור. רץ רק על DB שהשם שלו מסתיים ב-_test:
//
//   docker exec stock-sync-db psql -U sync -d postgres -c "create database stock_sync_gallery_test"
//   DATABASE_URL=postgres://…/stock_sync_gallery_test npx drizzle-kit migrate
//   DATABASE_URL=postgres://…/stock_sync_gallery_test npx tsx scripts/test-woo-gallery.ts

import { randomUUID } from 'node:crypto'

const dbName = new URL(process.env.DATABASE_URL ?? 'postgres://x/none').pathname.slice(1)
if (!dbName.endsWith('_test')) {
  console.error(`רק על DB של בדיקה (*_test). קיבלתי: ${dbName || '(ריק)'}`)
  process.exit(1)
}
const STORE = 'http://localhost:9'
Object.assign(process.env, { WC_BASE_URL: STORE, WC_CONSUMER_KEY: 'ck_test', WC_CONSUMER_SECRET: 'cs_test', WP_APP_USER: 'shop', WP_APP_PASSWORD: 'app pass' })

// ── חנות מדומה ───────────────────────────────────────────────────────────────

type Meta = { key: string; value: unknown }
interface P {
  id: number
  name: string
  slug: string
  status: string
  images: { id: number; src: string }[]
  meta_data: Meta[]
  [k: string]: unknown
}
const store = new Map<number, P>()
const media = new Map<number, { file: string; mime: string; bytes: number; alt: string }>()
let nextMedia = 5000
let nextTerm = 300
const calls = { batch: 0, batchedProducts: [] as number[], uploads: 0, ebay: 0 }
/** מזהי eBay: ‏webp לא קיים (נופל ל-JPEG המקורי) / לא קיים בכלל */
const noWebp = new Set<string>()
const dead = new Set<string>()

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const method = (init.method ?? 'GET').toUpperCase()

  if (url.hostname === 'i.ebayimg.com') {
    calls.ebay++
    const id = url.pathname.match(/\/(?:z|images\/g)\/([^/]+)\//)?.[1] ?? ''
    if (dead.has(id)) return new Response('gone', { status: 404 })
    if (url.pathname.endsWith('.webp')) return noWebp.has(id) ? new Response('nf', { status: 404 }) : new Response(new Uint8Array(1200), { headers: { 'content-type': 'image/webp' } })
    return new Response(new Uint8Array(900), { headers: { 'content-type': 'image/jpeg' } })
  }
  if (!url.href.startsWith(STORE)) throw new Error(`פנייה לא צפויה: ${url.href}`)
  const auth = new Headers(init.headers).get('authorization') ?? ''
  if (!auth.startsWith('Basic ')) return json({ code: 'rest_forbidden' }, 401)
  const path = url.pathname.replace('/wp-json/', '')

  if (path === 'wp/v2/media' && method === 'POST') {
    const file = new Headers(init.headers).get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? '?'
    const id = nextMedia++
    const mime = new Headers(init.headers).get('content-type') ?? ''
    media.set(id, { file, mime, bytes: (init.body as Uint8Array).length, alt: '' })
    calls.uploads++
    return json({ id, source_url: `${STORE}/wp-content/uploads/2026/10/${file}` }, 201)
  }
  const altM = path.match(/^wp\/v2\/media\/(\d+)$/)
  if (altM && method === 'POST') {
    media.get(Number(altM[1]))!.alt = JSON.parse(String(init.body)).alt_text
    return json({ id: Number(altM[1]) })
  }
  if (path === 'wc/v3/products' && method === 'GET') {
    const ids = (url.searchParams.get('include') ?? '').split(',').map(Number)
    return json(ids.map((i) => store.get(i)).filter(Boolean).map(clone))
  }
  if (path === 'wc/v3/products/batch' && method === 'POST') {
    calls.batch++
    const body = JSON.parse(String(init.body)) as { update?: (Partial<P> & { id: number })[] }
    const update = (body.update ?? []).map((u) => {
      const p = store.get(u.id)
      if (!p) return { id: 0, error: { message: 'not found' } }
      calls.batchedProducts.push(u.id)
      for (const [k, v] of Object.entries(u)) {
        if (k === 'id') continue
        if (k === 'images') p.images = (v as { id?: number; src?: string }[]).map((x) => (x.id ? { id: x.id, src: `${STORE}/att/${x.id}` } : { id: nextMedia++, src: String(x.src) }))
        else if (k === 'meta_data')
          for (const m of v as Meta[]) {
            const at = p.meta_data.findIndex((x) => x.key === m.key)
            if (at >= 0) p.meta_data[at] = { key: m.key, value: m.value }
            else p.meta_data.push({ key: m.key, value: m.value })
          }
        else p[k] = v
      }
      return { id: p.id }
    })
    return json({ update })
  }
  if (path === 'wc/v3/products/attributes' && method === 'GET') return json([{ id: 1, slug: 'pa_condition', name: 'Condition' }])
  if (/^wc\/v3\/products\/attributes\/\d+\/terms$/.test(path)) return method === 'GET' ? json(['New', 'Used'].map((name, i) => ({ id: 50 + i, name }))) : json({ id: nextTerm++ }, 201)
  if (path === 'wc/v3/products/categories' || path === 'wc/v3/products/brands') return method === 'GET' ? json([]) : json({ id: nextTerm++ }, 201)
  return json({ code: 'rest_no_route', message: path }, 404)
}) as typeof fetch

// ── בדיקות ───────────────────────────────────────────────────────────────────

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
}
const u = (id: string) => `https://i.ebayimg.com/00/s/MTYwMFgxMjAw/z/${id}/$_57.JPG`
const meta = (id: number, key: string) => store.get(id)!.meta_data.find((m) => m.key === key)?.value
const imgs = (id: number) => store.get(id)!.images.map((i) => i.id)

async function main() {
  const { db, schema, pool } = await import('@/lib/db/client')
  const { eq } = await import('drizzle-orm')
  const { applyGallery, planGallery } = await import('@/lib/sync/woo-gallery')
  const { syncStoreContent } = await import('@/lib/sync/woo-content')
  const { loadSources } = await import('@/lib/sync/woo-products')

  await db.execute(`truncate woo_media, sync_log, sync_cursors, channel_mappings, products restart identity cascade` as never)

  // 5 מוצרים: רגיל עם alt ותמונה מוסתרת · תמונה משותפת + בלי alt · webp חסר ב-eBay · גלריה קיימת בחנות · תמונה שנמחקה ב-eBay
  const fixtures: { woo: number; name: string; slug: string; main: number; gallery: string[]; extra?: Meta[]; wooGallery?: number[] }[] = [
    { woo: 101, name: 'Omron Test Part E3X', slug: 'omron-test-part-e3x', main: 9001, gallery: ['A1', 'A2', 'H1'], extra: [{ key: '_vz_img_alt', value: { A1: 'Front of the Omron unit', H1: 'label' } }, { key: '_vz_img_hidden', value: ['H1'] }] },
    { woo: 102, name: 'Lumenis Cover &amp; Joint', slug: 'lumenis-cover-joint', main: 9002, gallery: ['A2', 'B1'] },
    { woo: 103, name: 'ADIC Tape Drive', slug: 'adic-tape-drive', main: 9003, gallery: ['C1'] },
    { woo: 104, name: 'Has Woo Gallery', slug: 'has-woo-gallery', main: 9004, gallery: ['D1'], wooGallery: [9005] },
    { woo: 105, name: 'Partly Dead Images', slug: 'partly-dead-images', main: 9006, gallery: ['E1', 'E2'] },
  ]
  noWebp.add('C1')
  dead.add('E2')
  for (const f of fixtures) {
    const images = [u(`M${f.woo}`), ...f.gallery.map(u)]
    const [row] = await db.insert(schema.products).values({ title: f.name.replace('&amp;', '&'), images, detailsFetchedAt: new Date() } as never).returning({ id: schema.products.id })
    await db.insert(schema.channelMappings).values({ productId: row.id, sku: `T-${f.woo}`, wooProductId: f.woo, ebayItemId: `9${f.woo}` })
    store.set(f.woo, {
      id: f.woo,
      name: f.name,
      slug: f.slug,
      status: 'publish',
      images: [f.main, ...(f.wooGallery ?? [])].map((id) => ({ id, src: `${STORE}/att/${id}` })),
      meta_data: [{ key: '_sync_gallery', value: JSON.stringify(f.gallery.map(u)) }, ...(f.extra ?? [])],
    })
  }

  // ── תצוגה מקדימה לא כותבת ──
  const plan = await planGallery()
  check('preview: 4 to do + 1 conflict', JSON.stringify(plan.products.map((p) => p.state)) === JSON.stringify(['todo', 'todo', 'todo', 'conflict', 'todo']), plan.products.map((p) => p.state))
  check('preview: nothing written', calls.batch === 0 && calls.uploads === 0)

  // ── בלי בחירה — לא רץ ──
  let refused = false
  try {
    await applyGallery({})
  } catch {
    refused = true
  }
  check('apply without ids/limit/all is refused', refused && calls.uploads === 0)

  // ── ריצה 1 ──
  const r1 = await applyGallery({ ids: [101, 102, 103, 104, 105] })
  const out = (id: number, r = r1) => r.products.find((p) => p.wooProductId === id)!
  check('run1 outcomes', ['switched', 'switched', 'switched', 'conflict', 'upload_failed'].every((o, i) => out(101 + i).outcome === o), r1.products.map((p) => p.outcome))
  check('run1: 5 files uploaded (A1 A2 B1 C1 E1), shared A2 once', r1.uploaded === 5 && calls.uploads === 5 && out(102).reused === 1, { uploaded: r1.uploaded, reused: out(102).reused })
  check('run1: one batch write, only the 3 switched products', calls.batch === 1 && JSON.stringify(calls.batchedProducts) === '[101,102,103]', calls.batchedProducts)
  const att = new Map((await db.select().from(schema.wooMedia)).map((m) => [m.ebayImageId, m]))
  const a = (e: string) => att.get(e)!.wooAttachmentId
  check('p101: main + A1 + A2, in eBay order', JSON.stringify(imgs(101)) === JSON.stringify([9001, a('A1'), a('A2')]), imgs(101))
  check('p101: hidden label stays in _sync_gallery only', meta(101, '_sync_gallery') === JSON.stringify([u('H1')]))
  const alt101 = meta(101, '_vz_img_alt') as Record<string, string>
  check('p101: alt copied to a<id>, old keys kept', alt101[`a${a('A1')}`] === 'Front of the Omron unit' && alt101.A1 === 'Front of the Omron unit' && alt101.H1 === 'label', alt101)
  check('p101: _sync_gallery_media recorded', JSON.stringify(JSON.parse(String(meta(101, '_sync_gallery_media')))) === JSON.stringify([{ ebayId: 'A1', attachmentId: a('A1') }, { ebayId: 'A2', attachmentId: a('A2') }]))
  check('file names from slug + position', media.get(a('A1'))!.file === 'omron-test-part-e3x-2.webp' && media.get(a('A2'))!.file === 'omron-test-part-e3x-3.webp' && media.get(a('B1'))!.file === 'lumenis-cover-joint-3.webp', Array.from(media.values()).map((m) => m.file))
  check('media alt: store alt, else auto', media.get(a('A1'))!.alt === 'Front of the Omron unit' && media.get(a('B1'))!.alt === 'Lumenis Cover & Joint — photo 3 of 3', media.get(a('B1'))!.alt)
  check('p102: shares the A2 file, no _vz_img_alt written', JSON.stringify(imgs(102)) === JSON.stringify([9002, a('A2'), a('B1')]) && meta(102, '_vz_img_alt') === undefined)
  check('p103: no webp on eBay → original JPEG, .jpg name', media.get(a('C1'))!.file === 'adic-tape-drive-2.jpg' && media.get(a('C1'))!.mime === 'image/jpeg')
  check('p104 (existing Woo gallery): untouched', JSON.stringify(imgs(104)) === '[9004,9005]' && meta(104, '_sync_gallery_media') === undefined)
  check('p105: not switched, E1 kept in woo_media', JSON.stringify(imgs(105)) === '[9006]' && att.has('E1') && !att.has('E2'))
  const logs = await db.select().from(schema.syncLog).where(eq(schema.syncLog.job, 'woo_gallery'))
  check('sync_log: failed upload + conflict + per product + run', logs.some((l) => l.action === 'upload_image' && !l.success) && logs.some((l) => l.action === 'switch_gallery' && !l.success && (l.details as { existingGalleryIds?: number })?.existingGalleryIds === 1) && logs.filter((l) => l.action === 'run').length === 1)

  // ── ריצה 2: E2 חזר — רק הוא עולה, השאר "done" ──
  dead.delete('E2')
  calls.batchedProducts = []
  const before2 = calls.uploads
  const r2 = await applyGallery({ all: true })
  check('run2: switched products are done, no re-upload', ['done', 'done', 'done', 'conflict', 'switched'].every((o, i) => out(101 + i, r2).outcome === o) && calls.uploads - before2 === 1, r2.products.map((p) => p.outcome))
  check('run2: p105 reuses E1, uploads E2, only p105 written', out(105, r2).reused === 1 && out(105, r2).uploaded === 1 && JSON.stringify(calls.batchedProducts) === '[105]')

  // ── עדכון תוכן: eBay החליף תמונה במוצר 101 (A2 → A3) ──
  const [src101] = await loadSources([(await db.select().from(schema.channelMappings).where(eq(schema.channelMappings.wooProductId, 101)))[0].productId])
  const after101 = { ...src101, images: [u('M101'), u('A1'), u('A3'), u('H1')] }
  await db.update(schema.products).set({ images: after101.images }).where(eq(schema.products.id, src101.id))
  const c1 = await syncStoreContent([{ before: src101, after: after101 }], randomUUID())
  check('content: gallery change is applied (not "edited in store")', c1[0]?.status === 'updated' && c1[0].updated.includes('gallery'), c1)
  check('content: product back to eBay URLs, files detached not deleted', JSON.stringify(imgs(101)) === '[9001]' && meta(101, '_sync_gallery_media') === '[]' && media.has(a('A2')))
  const before3 = calls.uploads
  const r3 = await applyGallery({ ids: [101] })
  check('gallery job after the change: uploads only A3, reuses A1', out(101, r3).outcome === 'switched' && out(101, r3).uploaded === 1 && out(101, r3).reused === 1 && calls.uploads - before3 === 1, out(101, r3))

  // ── עדכון תוכן: הגלריה נערכה בחנות (מוצר 102) → לא נדרסת ──
  store.get(102)!.images = [{ id: 9002, src: '' }, { id: 7777, src: '' }]
  const [src102] = await loadSources([(await db.select().from(schema.channelMappings).where(eq(schema.channelMappings.wooProductId, 102)))[0].productId])
  const after102 = { ...src102, images: [u('M102'), u('B1'), u('B2')] }
  const c2 = await syncStoreContent([{ before: src102, after: after102 }], randomUUID())
  check('content: gallery edited in store is kept', c2[0]?.status === 'kept_edits' && c2[0].keptStoreEdits.includes('gallery') && JSON.stringify(imgs(102)) === '[9002,7777]', c2)

  console.log(failed ? `\n${failed} FAILED` : '\nall passed')
  await pool.end()
  process.exitCode = failed ? 1 : 0
}

main()
