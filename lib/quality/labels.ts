import sharp from 'sharp'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { geminiConfig, geminiJson, type GeminiPart } from '@/lib/google/gemini'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { ebayImageId, labelImages } from './checks'

export { labelImages }

// קריאת תווית המחסן מתמונות המוצר בעזרת Gemini. קריאה בלבד: לא נוגע ב-eBay, רק מוריד תמונות מה-CDN שלהן.
// התווית בדרך כלל בתמונה האחרונה (במודעה עם כמה יחידות — תווית לכל יחידה), לכן שולחים את 3 התמונות האחרונות.
// מוצר שהתמונות שלו לא השתנו מאז הקריאה הקודמת — לא נשלח שוב. הריצה נעצרת בתקרת ההוצאה.

export type LabelRow = typeof schema.labelReads.$inferSelect['labels'][number]

const CONCURRENCY = 3
/** הערכת עלות לקריאה אחת — כדי לא לחצות את התקרה בקריאה האחרונה */
const EST_CALL_USD = 0.0015

const PROMPT = `These photos are from an eBay listing of used industrial equipment. Each photo is preceded by its number.
Some listings include a photo of the seller's own warehouse label: a small white or cream sticker that shows
- a date (often white text in a black box, e.g. "13-Mar-22" or "04/11/2025"),
- a shelf location code (e.g. "YP15 D2 04 04", "SE C3 03 12", "SH D4 01 08"),
- a large stock number, usually 5 digits (e.g. "18475"),
- "Qty.N" or "Q N",
- weight and box size (e.g. "0.2kg 25*14*5").
Find every such warehouse label in the photos. Ignore manufacturer nameplates, part labels, barcodes and customer/shipping labels.
For each warehouse label return the photo number and the fields exactly as printed (null if a field is not readable).
If no photo shows a warehouse label, return an empty list.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    labels: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          photo: { type: 'INTEGER' },
          location: { type: 'STRING', nullable: true },
          number: { type: 'STRING', nullable: true },
          qty: { type: 'STRING', nullable: true },
          weight: { type: 'STRING', nullable: true },
          dims: { type: 'STRING', nullable: true },
          date: { type: 'STRING', nullable: true },
        },
        required: ['photo', 'number'],
      },
    },
  },
  required: ['labels'],
}

async function imagePart(url: string): Promise<GeminiPart> {
  const id = ebayImageId(url)
  const src = id ? `https://i.ebayimg.com/images/g/${id}/s-l1600.jpg` : url
  const res = await fetch(src, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`הורדת תמונה נכשלה (${res.status})`)
  const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  return { inline_data: { mime_type: 'image/jpeg', data: jpg.toString('base64') } }
}

export interface ReadLabelsResult {
  candidates: number
  read: number
  withLabel: number
  errors: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  stoppedByBudget: boolean
  maxUsd: number
  model: string
  durationMs: number
}

export async function readLabels(opts: { limit?: number; maxUsd?: number; random?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<ReadLabelsResult> {
  const cfg = geminiConfig()
  const maxUsd = Math.min(opts.maxUsd ?? cfg.maxUsd, cfg.maxUsd)
  return withJobLock('label-read', async () => {
    const started = Date.now()
    const rows = await db
      .select({ id: schema.products.id, images: schema.products.images, prevKey: schema.labelReads.imagesKey })
      .from(schema.products)
      .leftJoin(schema.labelReads, eq(schema.labelReads.productId, schema.products.id))
      .where(and(eq(schema.products.source, 'ebay'), eq(schema.products.archived, false), sql`jsonb_array_length(${schema.products.images}) > 0`))
      .orderBy(opts.random ? sql`random()` : schema.products.id)

    const todo = rows.map((r) => ({ ...r, sel: labelImages(r.images) })).filter((r) => r.prevKey !== r.sel.key)
    const queue = todo.slice(0, opts.limit ?? todo.length)
    const r: ReadLabelsResult = { candidates: todo.length, read: 0, withLabel: 0, errors: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, stoppedByBudget: false, maxUsd, model: cfg.model, durationMs: 0 }

    let next = 0
    /** קריאות שיצאו ועוד לא חזרו — נספרות בתקרה לפי ההערכה */
    let inflight = 0
    const worker = async () => {
      while (next < queue.length) {
        if (r.costUsd + (inflight + 1) * EST_CALL_USD > maxUsd) {
          r.stoppedByBudget = true
          return
        }
        const p = queue[next++]
        inflight++
        let labels: LabelRow[] = []
        let error: string | null = null
        let cost = 0
        let tin = 0
        let tout = 0
        try {
          const parts: GeminiPart[] = [{ text: PROMPT }]
          for (let i = 0; i < p.sel.urls.length; i++) parts.push({ text: `Photo ${p.sel.positions[i]}:` }, await imagePart(p.sel.urls[i]))
          const res = await geminiJson<{ labels: { photo: number; location: string | null; number: string | null; qty: string | null; weight: string | null; dims: string | null; date: string | null }[] }>(parts, SCHEMA)
          cost = res.costUsd
          tin = res.inputTokens
          tout = res.outputTokens
          labels = (res.data.labels ?? [])
            .filter((l) => p.sel.positions.includes(l.photo))
            .map((l) => ({ position: l.photo, location: l.location?.trim() || null, number: l.number?.replace(/\s/g, '') || null, qty: l.qty ?? null, weight: l.weight ?? null, dims: l.dims ?? null, date: l.date ?? null }))
        } catch (e) {
          error = e instanceof Error ? e.message.slice(0, 300) : String(e)
          cost = (e as { costUsd?: number }).costUsd ?? 0
          r.errors++
        }
        inflight--
        r.costUsd += cost
        r.inputTokens += tin
        r.outputTokens += tout
        r.read++
        if (labels.length) r.withLabel++
        const values = { imagesKey: p.sel.key, positions: p.sel.positions, labels, model: cfg.model, inputTokens: tin, outputTokens: tout, costUsd: cost.toFixed(6), error, readAt: new Date() }
        // שגיאה לא נשמרת כ"נקרא" — המפתח נשאר ריק כדי שהמוצר ייקרא שוב בריצה הבאה
        if (error) values.imagesKey = ''
        await db
          .insert(schema.labelReads)
          .values({ productId: p.id, ...values })
          .onConflictDoUpdate({ target: schema.labelReads.productId, set: values })
        opts.onProgress?.(r.read, queue.length)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    } finally {
      r.durationMs = Date.now() - started
      await writeSyncLog({ job: 'label-read', action: 'read_labels', success: r.errors < r.read || r.read === 0, details: { ...r }, durationMs: r.durationMs })
    }
    return r
  })
}
