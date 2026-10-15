import { CONTENT_FIELD_LABEL } from '@/components/sync/quality'
import { ebayImageId } from '@/lib/quality/checks'
import { cleanDescription } from '@/lib/woo/clean-description'
import { WooApiError, wooGet, wooRequest } from '@/lib/woo/client'
import { missingWooEnv } from '@/lib/woo/config'
import { brandKey, buildWooProduct, ensureBrands, ensureCategories, ensureConditionAttribute, loadBrands, type BuildContext } from '@/lib/woo/products'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { JobLockedError, withJobLock } from './lock'
import { writeSyncLog } from './log'
import { GALLERY_MEDIA_META, galleryMediaOf } from './woo-gallery'
import { loadSources } from './woo-products'

// עדכון תוכן המוצר בחנות אחרי שהמודעה ב-eBay השתנתה (למשל אחרי תיקון מבדיקת המודעות).
// רק מוצרים שכבר בחנות, ורק שדות התוכן שהשתנו ב-eBay: שם, תיאור, תמונה ראשית, גלריה, מאפיינים, מותג, קטגוריות, MPN.
// לא נוגעים במלאי, במחיר ובמשלוח (יש להם סנכרון משלהם), בסטטוס ובשדות שנוספו בחנות (SEO, שאלות, תגיות).
// שדה שנערך ידנית בחנות (הערך בחנות שונה ממה שהמערכת שלחה) — לא נדרס, ומדווח.
// עדכון שנכשל נשמר בתור (sync_cursors: woo_content_pending — המוצר כפי שהיה לפני השינוי) ונשלח שוב בריצה הבאה.

export const WOO_CONTENT_JOB = 'woo_content'
const PENDING_KEY = 'woo_content_pending'

export type SourceRow = Awaited<ReturnType<typeof loadSources>>[number]

export type ContentField = keyof typeof CONTENT_FIELD_LABEL

export interface StoreContentResult {
  productId: string
  sku: string
  wooProductId: number
  status: 'updated' | 'same' | 'kept_edits' | 'missing' | 'failed'
  /** שדות שעודכנו בחנות */
  updated: ContentField[]
  /** שדות שהשתנו ב-eBay אבל נערכו ידנית בחנות — לא נדרסו */
  keptStoreEdits: ContentField[]
  error?: string
}

/** השדות שמשפיעים על התוכן בחנות — לזיהוי "השתנה משהו ב-eBay" */
export function contentSignature(s: SourceRow): string {
  return JSON.stringify([s.title, s.description, s.images, s.brand, s.mpn, s.itemSpecifics, s.condition, s.conditionId, s.conditionDescription, s.ebayCategoryId, s.ebayCategoryName])
}

interface WooProductState {
  id: number
  name: string
  description: string
  images: { id: number; src: string }[]
  attributes: { id: number; name: string; options: string[] }[]
  brands?: { id: number }[]
  categories: { id: number }[]
  meta_data: { key: string; value: unknown }[]
}

type Payload = ReturnType<typeof buildWooProduct>

const META_FIELDS: [ContentField, string[]][] = [
  ['gallery', ['_sync_gallery']],
  ['mpn', ['_mpn', '_mpn_norm']],
  ['condition_notes', ['_condition_notes']],
  ['ebay_category', ['_sync_ebay_category']],
]

// השוואה לפי תוכן ולא לפי עיצוב: החנות שומרת & כ-&amp;, התיאור נשמר בחלוקת פסקאות אחרת,
// והגלריה יכולה להצביע על אותה תמונה בגודל אחר ($_57 / $_1). נמדד מול החנות 13/10 על 500 מוצרים.
const decode = (t: string) =>
  t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&')
const text = (t: string) => decode(t).replace(/\s+/g, ' ').trim()
const htmlText = (h: string) => text(h.replace(/<[^>]*>/g, ' '))

function galleryKey(v: string): string {
  try {
    const urls = JSON.parse(v) as unknown
    return Array.isArray(urls) ? JSON.stringify(urls.map((u) => ebayImageId(String(u)) ?? String(u))) : text(v)
  } catch {
    return text(v)
  }
}

/** סדר לא נבדק: אחרי מעבר הגלריה לספרייה המוסתרות נשארות ב-_sync_gallery והשאר ב-images, והסדר המקורי לא נשמר בחנות */
// הערך של שדה gallery (metaOf): JSON של רשימה עם מחרוזת אחת — JSON של מזהי התמונות
const gallerySetKey = (key: string) => {
  try {
    const inner = JSON.parse((JSON.parse(key) as string[])[0]) as string[]
    return Array.isArray(inner) ? JSON.stringify([JSON.stringify(inner.slice().sort())]) : key
  } catch {
    return key
  }
}

/**
 * הגלריה בחנות אחרי המעבר לספריית המדיה (lib/sync/woo-gallery.ts), כמזהי תמונות של eBay.
 * null = המוצר לא עבר. אם הגלריה בחנות כבר לא זהה למה שהסנכרון חיבר — "נערך בחנות".
 */
function migratedGallery(w: WooProductState): string | null {
  const media = galleryMediaOf(w.meta_data)
  if (!media.length) return null
  if (JSON.stringify(w.images.slice(1).map((i) => i.id)) !== JSON.stringify(media.map((m) => m.attachmentId))) return '__edited_in_store__'
  const rest = JSON.parse(galleryKey(String(w.meta_data.find((x) => x.key === '_sync_gallery')?.value ?? '[]'))) as string[]
  return gallerySetKey(JSON.stringify([JSON.stringify([...media.map((m) => m.ebayId), ...rest])]))
}

const sortedIds = (xs: { id: number }[] | undefined) => JSON.stringify((xs ?? []).map((x) => x.id).sort((a, b) => a - b))

function attrsKey(attrs: { id?: number; name?: string; options: string[] }[], conditionId: number): string {
  const m = attrs.map((a) => [a.id && a.id === conditionId ? '__condition' : text(a.name ?? '').toLowerCase(), a.options.map(text).sort()] as const)
  return JSON.stringify(m.sort((a, b) => a[0].localeCompare(b[0])))
}

const metaOf = (metas: { key: string; value: unknown }[], keys: string[]) =>
  JSON.stringify(keys.map((k) => String(metas.find((x) => x.key === k)?.value ?? '')).map((v, i) => (keys[i] === '_sync_gallery' ? galleryKey(v) : text(v))))

/** הערך של כל שדה — בתשלום שהמערכת בונה, ובמוצר כפי שהוא בחנות */
function fieldValues(f: ContentField, p: Payload, s: SourceRow, conditionId: number): string {
  switch (f) {
    case 'name':
      return text(p.name)
    case 'description':
      return htmlText(p.description)
    case 'image':
      return (s.images[0] && (ebayImageId(s.images[0]) ?? s.images[0])) || ''
    case 'attributes':
      return attrsKey(p.attributes, conditionId)
    case 'brands':
      return sortedIds(p.brands)
    case 'categories':
      return sortedIds('categories' in p ? p.categories : [])
    default:
      return metaOf(p.meta_data, META_FIELDS.find(([k]) => k === f)![1])
  }
}

function storeValue(f: ContentField, w: WooProductState, conditionId: number): string | null {
  switch (f) {
    case 'name':
      return text(w.name)
    case 'description':
      // גם מה שבחנות עובר את אותו ניקוי: בחלק מהמוצרים בחנות עדיין יש בלוקי Shipping / Returns או תבנית eBay גולמית,
      // וזה לא "עריכה ידנית" שצריך לשמור עליה (נמדד 13/10)
      return htmlText(cleanDescription(w.description, w.name).html)
    case 'image': {
      // מוצרים שנוצרו לפני שנשמר _sync_main_image — אין דרך לדעת אם התמונה הוחלפה בחנות; נחשב כלא נערך
      const m = w.meta_data.find((x) => x.key === '_sync_main_image')
      return m ? String(m.value) : null
    }
    case 'attributes':
      return attrsKey(w.attributes, conditionId)
    case 'brands':
      return sortedIds(w.brands)
    case 'categories':
      return sortedIds(w.categories)
    default:
      return metaOf(w.meta_data, META_FIELDS.find(([k]) => k === f)![1])
  }
}

const FIELDS: ContentField[] = ['name', 'description', 'image', 'gallery', 'attributes', 'brands', 'categories', 'mpn', 'condition_notes', 'ebay_category']

type Pending = Record<string, SourceRow>

async function loadPending(): Promise<Pending> {
  const [row] = await db.select().from(schema.syncCursors).where(eq(schema.syncCursors.key, PENDING_KEY))
  if (!row) return {}
  try {
    const raw = JSON.parse(row.value) as Pending
    // JSON מחזיר תאריכים כמחרוזת
    for (const v of Object.values(raw)) v.ebayListingStartedAt = v.ebayListingStartedAt ? new Date(v.ebayListingStartedAt) : null
    return raw
  } catch {
    return {}
  }
}

async function savePending(p: Pending) {
  const value = JSON.stringify(p)
  await db.insert(schema.syncCursors).values({ key: PENDING_KEY, value }).onConflictDoUpdate({ target: schema.syncCursors.key, set: { value, updatedAt: sql`now()` } })
}

/** כמה מוצרים ממתינים לעדכון תוכן בחנות (אחרי כשל) */
export async function pendingStoreContentCount(): Promise<number> {
  return Object.keys(await loadPending()).length
}

/**
 * מעדכן בחנות את התוכן של מוצרים שהשתנו ב-eBay, ושולח שוב את מה שנכשל בפעם הקודמת.
 * before = המוצר לפני הקריאה מחדש מ-eBay, after = אחריה. ריצה אחת בכל פעם (שתי לחיצות במקביל — השנייה מחכה).
 */
export async function syncStoreContent(pairs: { before: SourceRow; after: SourceRow }[], runId: string): Promise<StoreContentResult[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withJobLock(WOO_CONTENT_JOB, () => syncLocked(pairs, runId))
    } catch (e) {
      if (!(e instanceof JobLockedError) || attempt >= 40) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

async function syncLocked(input: { before: SourceRow; after: SourceRow }[], runId: string): Promise<StoreContentResult[]> {
  // מה שממתין מכשל קודם: "לפני" = מה שהחנות קיבלה בפעם האחרונה, "אחרי" = המצב הנוכחי במערכת
  const pending = await loadPending()
  const pairs = input.map((p) => ({ before: pending[p.after.id] ?? p.before, after: p.after }))
  const retry = Object.keys(pending).filter((id) => !pairs.some((p) => p.after.id === id))
  if (retry.length) for (const after of await loadSources(retry)) pairs.push({ before: pending[after.id], after })
  for (const id of retry) if (!pairs.some((p) => p.after.id === id)) delete pending[id]

  const results = await syncPairs(pairs, runId)
  // אין מה לעדכן (התוכן חזר להיות כמו בחנות / המוצר לא בחנות) — יוצא מהתור
  for (const p of pairs) if (!results.some((r) => r.productId === p.after.id)) delete pending[p.after.id]
  for (const r of results) {
    if (r.status === 'failed') pending[r.productId] = pairs.find((p) => p.after.id === r.productId)!.before
    else delete pending[r.productId]
  }
  await savePending(pending)
  return results
}

/** before → after לכל מוצר שבחנות. שדה מתעדכן רק אם השתנה ב-eBay והערך בחנות עדיין זהה למה שהמערכת שלחה (לא נערך ידנית). */
async function syncPairs(pairs: { before: SourceRow; after: SourceRow }[], runId: string): Promise<StoreContentResult[]> {
  const todo = pairs.filter((p) => p.after.wooProductId && !p.after.archived && contentSignature(p.before) !== contentSignature(p.after))
  if (!todo.length) return []
  const base = (p: SourceRow) => ({ productId: p.id, sku: p.sku, wooProductId: p.wooProductId!, updated: [] as ContentField[], keptStoreEdits: [] as ContentField[] })
  if (missingWooEnv().length) return todo.map((p) => ({ ...base(p.after), status: 'failed', error: 'החיבור לחנות לא מוגדר בשרת' }))

  let ctx: BuildContext
  let store: Map<number, WooProductState>
  try {
    const brandIds = await loadBrands()
    const names = new Map(todo.filter((p) => p.after.brand).map((p) => [brandKey(p.after.brand!), p.after.brand!.trim()]))
    await ensureBrands(names, brandIds)
    ctx = { conditionAttributeId: await ensureConditionAttribute(), brandIds, categoryIds: await ensureCategories() }
    store = new Map()
    const ids = todo.map((p) => p.after.wooProductId!)
    for (let i = 0; i < ids.length; i += 50) {
      const r = await wooGet<WooProductState[]>('products', {
        include: ids.slice(i, i + 50).join(','),
        status: 'any',
        per_page: 50,
        context: 'edit',
        _fields: 'id,name,description,images,attributes,brands,categories,meta_data',
      })
      for (const w of r.data) store.set(w.id, w)
    }
  } catch (e) {
    const error = e instanceof WooApiError ? e.message : e instanceof Error ? e.message : 'שגיאה מול החנות'
    await writeSyncLog({ runId, job: WOO_CONTENT_JOB, channel: 'woo', action: 'update_content', success: false, error, details: { products: todo.length } })
    return todo.map((p) => ({ ...base(p.after), status: 'failed', error }))
  }

  const results: StoreContentResult[] = []
  const updates: { result: StoreContentResult; body: Record<string, unknown> }[] = []
  for (const { before, after } of todo) {
    const r: StoreContentResult = { ...base(after), status: 'same' }
    results.push(r)
    const w = store.get(after.wooProductId!)
    if (!w) {
      r.status = 'missing'
      r.error = 'המוצר לא נמצא בחנות (נמחק?)'
      continue
    }
    const oldP = buildWooProduct(before, ctx)
    const newP = buildWooProduct(after, ctx)
    const body: Record<string, unknown> = { id: w.id }
    const meta: { key: string; value: string }[] = []
    for (const f of FIELDS) {
      const was = fieldValues(f, oldP, before, ctx.conditionAttributeId)
      const now = fieldValues(f, newP, after, ctx.conditionAttributeId)
      if (was === now) continue
      const migrated = f === 'gallery' ? migratedGallery(w) : null
      const inStore = migrated ?? storeValue(f, w, ctx.conditionAttributeId)
      if (inStore === (migrated ? gallerySetKey(now) : now)) continue
      if (inStore !== null && inStore !== (migrated ? gallerySetKey(was) : was)) {
        r.keptStoreEdits.push(f)
        continue
      }
      r.updated.push(f)
      if (f === 'name') body.name = newP.name
      else if (f === 'description') body.description = newP.description
      else if (f === 'attributes') body.attributes = newP.attributes
      else if (f === 'brands') body.brands = newP.brands
      else if (f === 'categories') body.categories = 'categories' in newP ? newP.categories : []
      else if (f === 'image') {
        // רק התמונה הראשית מוחלפת; תמונות נוספות שהועלו בחנות נשארות
        body.images = [...newP.images, ...w.images.slice(1).map((i) => ({ id: i.id }))]
        meta.push({ key: '_sync_main_image', value: now })
      } else if (f === 'gallery' && migrated) {
        // הגלריה כבר בספרייה: חוזרים לכתובות של eBay (הקבצים מתנתקים מהמוצר, לא נמחקים),
        // והריצה הבאה של job:woo-gallery מעלה רק את מה שחדש (שימוש חוזר לפי woo_media)
        body.images = ((body.images as unknown[] | undefined) ?? w.images.map((i) => ({ id: i.id }))).slice(0, 1)
        meta.push({ key: '_sync_gallery', value: newP.meta_data.find((x) => x.key === '_sync_gallery')?.value ?? '[]' }, { key: GALLERY_MEDIA_META, value: '[]' })
      } else {
        const keys = META_FIELDS.find(([k]) => k === f)![1]
        for (const k of keys) meta.push({ key: k, value: newP.meta_data.find((x) => x.key === k)?.value ?? '' })
      }
    }
    if (r.updated.length) {
      body.meta_data = [...meta, { key: '_sync_updated_at', value: new Date().toISOString() }]
      updates.push({ result: r, body })
    } else if (r.keptStoreEdits.length) r.status = 'kept_edits'
  }

  // תמונה ראשית יורדת לחנות — מנות קטנות כמו ביצירה
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10)
    let res: ({ id?: number; error?: { message?: string } } | undefined)[]
    try {
      const r = await wooRequest<{ update?: { id?: number; error?: { message?: string } }[] }>('POST', 'products/batch', { body: { update: chunk.map((c) => c.body) }, timeoutMs: 120_000 })
      res = r.data.update ?? []
    } catch (e) {
      const msg = e instanceof WooApiError ? e.message : 'שגיאה לא צפויה בעדכון המוצרים'
      res = chunk.map(() => ({ error: { message: msg } }))
    }
    chunk.forEach((c, j) => {
      if (res[j]?.id && !res[j]?.error) c.result.status = 'updated'
      else {
        c.result.status = 'failed'
        c.result.error = res[j]?.error?.message ?? 'החנות לא אישרה את העדכון'
      }
    })
  }

  await writeSyncLog(
    results.map((r) => ({
      runId,
      job: WOO_CONTENT_JOB,
      channel: 'woo' as const,
      action: 'update_content',
      productId: r.productId,
      success: r.status !== 'failed' && r.status !== 'missing',
      error: r.error ?? null,
      details: { sku: r.sku, wooProductId: r.wooProductId, status: r.status, updated: r.updated, keptStoreEdits: r.keptStoreEdits },
    })),
  )
  return results
}

/**
 * בדיקה, קריאה בלבד: לכל מוצר שבחנות — האם כל שדה תוכן בחנות זהה למה שהמערכת הייתה שולחת עכשיו.
 * מראה אם שיטת ההשוואה עובדת (WordPress לא משנה את מה שנשלח) וכמה שדות נערכו ידנית בחנות. לא כותב כלום.
 */
export async function auditStoreContent(limit = 50) {
  const rows = await db
    .select({ id: schema.channelMappings.productId })
    .from(schema.channelMappings)
    .where(sql`${schema.channelMappings.wooProductId} is not null`)
    .limit(Math.min(Math.max(limit, 1), 500))
  const sources = (await loadSources(rows.map((r) => r.id))).filter((s) => s.wooProductId && !s.archived)
  const brandIds = await loadBrands()
  const { data: attrs } = await wooGet<{ id: number; slug: string }[]>('products/attributes')
  const categoryIds = new Map<string, number>()
  for (let page = 1; ; page++) {
    const r = await wooGet<{ id: number; slug: string }[]>('products/categories', { per_page: 100, page, _fields: 'id,slug' })
    for (const c of r.data) categoryIds.set(c.slug, c.id)
    if (!r.totalPages || page >= r.totalPages) break
  }
  const ctx: BuildContext = { conditionAttributeId: attrs.find((a) => a.slug === 'pa_condition')?.id ?? 0, brandIds, categoryIds }
  const perField = Object.fromEntries(FIELDS.map((f) => [f, { same: 0, differs: 0, unknown: 0 }])) as Record<ContentField, { same: number; differs: number; unknown: number }>
  const examples: { sku: string; wooProductId: number; field: ContentField; at: number; lengths: [number, number]; system: string; store: string }[] = []
  let missing = 0
  for (let i = 0; i < sources.length; i += 50) {
    const chunk = sources.slice(i, i + 50)
    const r = await wooGet<WooProductState[]>('products', { include: chunk.map((s) => s.wooProductId).join(','), status: 'any', per_page: 50, context: 'edit', _fields: 'id,name,description,images,attributes,brands,categories,meta_data' })
    const byId = new Map(r.data.map((w) => [w.id, w]))
    for (const s of chunk) {
      const w = byId.get(s.wooProductId!)
      if (!w) {
        missing++
        continue
      }
      const p = buildWooProduct(s, ctx)
      for (const f of FIELDS) {
        const migrated = f === 'gallery' ? migratedGallery(w) : null
        const inStore = migrated ?? storeValue(f, w, ctx.conditionAttributeId)
        const sysValue = fieldValues(f, p, s, ctx.conditionAttributeId)
        if (inStore === null) perField[f].unknown++
        else if (inStore === (migrated ? gallerySetKey(sysValue) : sysValue)) perField[f].same++
        else {
          perField[f].differs++
          if (examples.filter((e) => e.field === f).length < 4) {
            // סביב ההבדל הראשון, כדי לראות מה שונה
            const sys = fieldValues(f, p, s, ctx.conditionAttributeId)
            let at = 0
            while (at < sys.length && sys[at] === inStore[at]) at++
            const from = Math.max(0, at - 60)
            examples.push({ sku: s.sku, wooProductId: w.id, field: f, at, lengths: [sys.length, inStore.length], system: sys.slice(from, from + 200), store: inStore.slice(from, from + 200) })
          }
        }
      }
    }
  }
  return { products: sources.length, missing, perField, examples }
}
