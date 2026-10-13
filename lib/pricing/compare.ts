import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { getItemDetails, htmlToText, type BrowseItemDetails } from '@/lib/ebay/browse'
import { geminiConfig, geminiConfigured, geminiJson } from '@/lib/google/gemini'
import { withJobLock } from '@/lib/sync/lock'
import { writeSyncLog } from '@/lib/sync/log'
import { compareListings, gapPct, type DiffEffect, type ListingDiff, type ListingSide } from './compare-rules'

// השוואה מעמיקה: המודעה שלנו מול מודעת מתחרה — מה שונה ולמה יש פער מחיר.
// 1 קריאת GET ל-eBay (Browse getItem) לכל מודעת מתחרה; הצד שלנו מה-DB. הבדלים לפי כללים (חינם),
// ואז Gemini קורא את שתי המודעות (טקסט בלבד) ומסביר. שום דבר לא משתנה ב-eBay.
// מופעל מהמסך (לפי בקשה) או אחרי הבדיקה היומית — רק למודעות עם פער גדול (החלטת עודד 13/10/2026).

const JOB = 'price-compare'
const CONCURRENCY = 3
/** הערכת עלות לקריאת Gemini אחת (טקסט, ~4K טוקנים) — כדי לא לחצות את התקרה */
const EST_AI_USD = 0.002

export type SameProduct = 'same' | 'variant' | 'different' | 'unsure'
export type Justified = 'yes' | 'partly' | 'no' | 'unclear'

export interface AiComparison {
  sameProduct: SameProduct
  sameProductReason: string
  /** כמה מילים — מה מסביר את הפער */
  headline: string
  explanation: string
  justified: Justified
  differences: { aspect: string; ours: string; theirs: string; effect: DiffEffect }[]
}

const AI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sameProduct: { type: 'STRING', enum: ['same', 'variant', 'different', 'unsure'] },
    sameProductReason: { type: 'STRING' },
    headline: { type: 'STRING' },
    explanation: { type: 'STRING' },
    justified: { type: 'STRING', enum: ['yes', 'partly', 'no', 'unclear'] },
    differences: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          aspect: { type: 'STRING' },
          ours: { type: 'STRING' },
          theirs: { type: 'STRING' },
          effect: { type: 'STRING', enum: ['lower', 'higher', 'neutral'] },
        },
        required: ['aspect', 'ours', 'theirs', 'effect'],
      },
    },
  },
  required: ['sameProduct', 'sameProductReason', 'headline', 'explanation', 'justified', 'differences'],
}

const PROMPT = `You compare two eBay listings of used/surplus industrial or medical equipment that share the same part number.
"OURS" is our listing; "THEIRS" is a competitor's. Prices are in USD.
Decide:
1. sameProduct — "same" (same part, interchangeable), "variant" (same family but a different revision/version/option/configuration), "different" (another product), or "unsure". Explain briefly in sameProductReason.
2. differences — the real differences a buyer would care about: condition and condition notes, tested/untested/for parts, what is included or missing (cables, power supply, software, accessories), revision/firmware, quantity in the lot, warranty, returns, seller location, anything else in the descriptions. Only list differences supported by the text. effect: "lower" if it explains THEIRS being cheaper than OURS, "higher" if it explains THEIRS being more expensive, "neutral" otherwise. Max 8.
3. justified — is the price gap explained by those differences? "yes", "partly", "no" (same thing, the price is simply different), or "unclear".
4. headline — max 8 words, the main reason for the gap. explanation — 2-4 short sentences: why the prices differ and what it means for our price.
Ignore generic seller boilerplate (shipping policy, "we test everything", payment terms) unless it is specific to the item.
Write sameProductReason, headline, explanation, aspect, ours and theirs in HEBREW. Keep part numbers, brands and model names in English.`

export interface CompareOutcome {
  offerId: number
  ebayItemId: string
  ok: boolean
  error: string | null
  aiError: string | null
  costUsd: number
  calls: number
}

export interface CompareRunResult {
  requested: number
  compared: number
  errors: number
  ebayCalls: number
  aiCostUsd: number
  aiSkipped: boolean
  stoppedByBudget: boolean
  outcomes: CompareOutcome[]
}

type Target = {
  offerId: number
  productId: string
  ebayItemId: string
  offerPrice: string | null
  offerShipping: string | null
  ourPrice: string | null
  ourShipping: string | null
}

type OurProduct = typeof schema.products.$inferSelect & { available: number | null }

async function loadTargets(offerIds: number[]): Promise<Target[]> {
  if (!offerIds.length) return []
  const o = schema.competitorOffers
  const pc = schema.priceChecks
  return db
    .select({
      offerId: o.id,
      productId: o.productId,
      ebayItemId: o.ebayItemId,
      offerPrice: o.price,
      offerShipping: o.shipping,
      ourPrice: pc.ourPrice,
      ourShipping: pc.ourShipping,
    })
    .from(o)
    .innerJoin(pc, eq(pc.id, o.checkId))
    .where(inArray(o.id, offerIds))
}

async function loadProducts(ids: string[]): Promise<Map<string, OurProduct>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ p: schema.products, available: schema.channelMappings.lastEbayQty })
    .from(schema.products)
    .leftJoin(schema.channelMappings, eq(schema.channelMappings.productId, schema.products.id))
    .where(inArray(schema.products.id, ids))
  return new Map(rows.map((r) => [r.p.id, { ...r.p, available: r.available }]))
}

const n = (v: string | number | null | undefined) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function oursSide(p: OurProduct, ourPrice: number | null, ourShipping: number | null): ListingSide {
  const specifics: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.itemSpecifics ?? {})) if (v?.length) specifics[k] = v.join(', ')
  const rp = p.returnPolicy
  return {
    title: p.title,
    subtitle: p.subtitle,
    condition: p.condition,
    conditionId: p.conditionId,
    conditionDescription: p.conditionDescription,
    specifics,
    mpn: p.mpn,
    description: htmlToText(p.description),
    price: ourPrice ?? n(p.price),
    shipping: ourShipping,
    returnsAccepted: rp?.accepted ?? null,
    returnDays: rp?.accepted ? rp.withinDays : null,
    available: p.available,
    lotSize: null,
    country: p.country,
    listedAt: p.ebayListingStartedAt ? p.ebayListingStartedAt.toISOString() : null,
  }
}

export function theirsSide(d: BrowseItemDetails, shipping: number | null): ListingSide {
  return {
    title: d.title,
    subtitle: d.subtitle,
    condition: d.condition,
    conditionId: d.conditionId,
    conditionDescription: d.conditionDescription,
    specifics: d.specifics,
    mpn: d.mpn,
    description: d.description,
    price: n(d.price),
    shipping,
    returnsAccepted: d.returnsAccepted,
    returnDays: d.returnDays,
    available: d.available,
    lotSize: d.lotSize,
    country: d.country,
    seller: d.seller,
    sellerFeedbackScore: d.sellerFeedbackScore,
    topRated: d.topRated,
    listedAt: d.listedAt,
  }
}

function sideText(name: string, s: ListingSide): string {
  const lines = [
    `=== ${name} ===`,
    `Title: ${s.title}`,
    s.subtitle ? `Subtitle: ${s.subtitle}` : null,
    `Item price: ${s.price != null ? `$${s.price}` : 'unknown'}; shipping to US buyer: ${s.shipping != null ? `$${s.shipping}` : 'unknown'}`,
    `Condition: ${s.condition ?? 'not stated'}`,
    s.conditionDescription ? `Condition notes: ${s.conditionDescription}` : null,
    `Returns: ${s.returnsAccepted == null ? 'not stated' : s.returnsAccepted ? `accepted${s.returnDays ? `, ${s.returnDays} days` : ''}` : 'not accepted'}`,
    `Ships from: ${s.country ?? 'unknown'}; units available: ${s.available ?? 'unknown'}${s.lotSize ? `; lot of ${s.lotSize}` : ''}`,
    s.seller ? `Seller: ${s.seller} (${s.sellerFeedbackScore ?? '?'} feedback${s.topRated ? ', Top Rated' : ''})` : null,
    s.listedAt ? `Listed since: ${s.listedAt.slice(0, 10)}` : null,
    Object.keys(s.specifics).length ? `Item specifics:\n${Object.entries(s.specifics).slice(0, 40).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : null,
    s.description ? `Description:\n${s.description.slice(0, 2500)}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}

async function explain(ours: ListingSide, theirs: ListingSide, diffs: ListingDiff[]): Promise<{ ai: AiComparison; costUsd: number; model: string }> {
  const ruleHints = diffs.length ? `\n=== Differences already found by rules (verify, do not just repeat) ===\n${diffs.map((d) => `- ${d.key}: ours=${d.ours}; theirs=${d.theirs}`).join('\n')}` : ''
  const r = await geminiJson<AiComparison>([{ text: `${PROMPT}\n\n${sideText('OURS', ours)}\n\n${sideText('THEIRS', theirs)}${ruleHints}` }], AI_SCHEMA)
  const ai = r.data
  ai.differences = (ai.differences ?? []).slice(0, 8)
  return { ai, costUsd: r.costUsd, model: r.model }
}

async function compareOne(
  t: Target,
  p: OurProduct,
  trigger: 'auto' | 'manual',
  aiBudget: { left: number } | null,
): Promise<CompareOutcome> {
  const out: CompareOutcome = { offerId: t.offerId, ebayItemId: t.ebayItemId, ok: false, error: null, aiError: null, costUsd: 0, calls: 0 }
  const ourPrice = n(t.ourPrice) ?? n(p.price)
  const values: Partial<typeof schema.offerComparisons.$inferInsert> = {
    trigger,
    ourPrice: ourPrice != null ? String(ourPrice) : null,
    theirPrice: t.offerPrice,
    gapPct: (() => {
      const g = gapPct(ourPrice, n(t.offerPrice))
      return g != null ? String(g) : null
    })(),
    comparedAt: new Date(),
    error: null,
    // השוואה חוזרת בלי Gemini לא משאירה הסבר ישן ליד הבדלים חדשים
    ai: null,
    aiModel: null,
    aiCostUsd: null,
    aiError: null,
  }
  try {
    out.calls = 1
    const details = await getItemDetails(t.ebayItemId)
    const ours = oursSide(p, ourPrice, n(t.ourShipping))
    const theirs = theirsSide(details, n(t.offerShipping))
    const diffs = compareListings(ours, theirs)
    Object.assign(values, { theirs: details, diffs, theirPrice: details.price ?? t.offerPrice })
    const g = gapPct(ourPrice, n(details.price ?? t.offerPrice))
    values.gapPct = g != null ? String(g) : null

    if (!aiBudget) {
      values.aiError = geminiConfigured() ? null : 'Gemini לא מוגדר — הוצגו רק הבדלים לפי כללים'
    } else if (aiBudget.left < EST_AI_USD) {
      values.aiError = 'תקרת ההוצאה של הריצה הגיעה — הוצגו רק הבדלים לפי כללים'
    } else {
      aiBudget.left -= EST_AI_USD
      try {
        const r = await explain(ours, theirs, diffs)
        aiBudget.left += EST_AI_USD - r.costUsd
        out.costUsd = r.costUsd
        Object.assign(values, { ai: r.ai, aiModel: r.model, aiCostUsd: r.costUsd.toFixed(6) })
      } catch (e) {
        const cost = (e as { costUsd?: number }).costUsd ?? 0
        aiBudget.left += EST_AI_USD - cost
        out.costUsd = cost
        values.aiError = e instanceof Error ? e.message.slice(0, 300) : String(e)
      }
    }
    out.ok = true
  } catch (e) {
    values.error = e instanceof Error ? e.message.slice(0, 300) : String(e)
    out.error = values.error
  }
  out.aiError = values.aiError ?? null

  const insert = db.insert(schema.offerComparisons).values({ productId: t.productId, ebayItemId: t.ebayItemId, ...values } as typeof schema.offerComparisons.$inferInsert)
  // כשל (eBay לא זמין / המודעה ירדה) לא מוחק השוואה קודמת טובה — נשמר רק כשאין שום השוואה
  if (out.error) await insert.onConflictDoNothing()
  else await insert.onConflictDoUpdate({ target: [schema.offerComparisons.productId, schema.offerComparisons.ebayItemId], set: values })
  return out
}

/** השוואה מעמיקה למודעות (competitor_offers.id). maxUsd — תקרת Gemini לריצה (לא יותר מ-GEMINI_MAX_USD_PER_RUN) */
export async function compareOffers(offerIds: number[], opts: { trigger: 'auto' | 'manual'; maxUsd?: number; runId?: string }): Promise<CompareRunResult> {
  // הריצה היומית — תחת נעילה; מהמסך — בלי (כמה השוואות קטנות במקביל זה בסדר)
  const run = async () => {
    const started = Date.now()
    const targets = await loadTargets(Array.from(new Set(offerIds)))
    const products = await loadProducts(Array.from(new Set(targets.map((t) => t.productId))))
    const aiOn = geminiConfigured()
    const budget = aiOn ? { left: Math.min(opts.maxUsd ?? geminiConfig().maxUsd, geminiConfig().maxUsd) } : null

    const outcomes: CompareOutcome[] = []
    let next = 0
    const worker = async () => {
      while (next < targets.length) {
        const t = targets[next++]
        const p = products.get(t.productId)
        if (!p) continue
        outcomes.push(await compareOne(t, p, opts.trigger, budget))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))

    const result: CompareRunResult = {
      requested: offerIds.length,
      compared: outcomes.filter((o) => o.ok).length,
      errors: outcomes.filter((o) => o.error).length,
      ebayCalls: outcomes.reduce((a, o) => a + o.calls, 0),
      aiCostUsd: Math.round(outcomes.reduce((a, o) => a + o.costUsd, 0) * 1e6) / 1e6,
      aiSkipped: !aiOn,
      stoppedByBudget: outcomes.some((o) => o.aiError?.startsWith('תקרת')),
      outcomes,
    }
    await writeSyncLog({
      runId: opts.runId,
      job: JOB,
      channel: 'ebay',
      action: 'offer_compare',
      success: result.errors === 0,
      error: outcomes.find((o) => o.error)?.error ?? null,
      durationMs: Date.now() - started,
      details: { trigger: opts.trigger, requested: result.requested, compared: result.compared, errors: result.errors, ebayCalls: result.ebayCalls, aiCostUsd: result.aiCostUsd, aiSkipped: result.aiSkipped, stoppedByBudget: result.stoppedByBudget },
    })
    return result
  }
  return opts.trigger === 'auto' ? withJobLock(JOB, run) : run()
}

/**
 * אחרי הבדיקה היומית: מודעות בהשוואה שהפער שלהן מהמחיר שלנו ≥ minGapPct (לשני הכיוונים),
 * מהבדיקה האחרונה לכל מוצר, ושלא הושוו ב-staleDays האחרונים. הפער הגדול קודם.
 */
export async function autoCompareCandidates(opts: { minGapPct?: number; maxOffers?: number; staleDays?: number; country?: string } = {}): Promise<number[]> {
  const minGap = opts.minGapPct ?? 30
  const rows = await db.execute<{ id: string }>(sql`
    with latest as (
      select distinct on (pc.product_id, pc.country) pc.*
      from price_checks pc
      where pc.country = ${opts.country ?? 'US'} and pc.error is null
      order by pc.product_id, pc.country, pc.checked_at desc)
    select o.id
    from latest l
    join competitor_offers o on o.check_id = l.id and o.compared and o.price is not null
    left join offer_comparisons c on c.product_id = o.product_id and c.ebay_item_id = o.ebay_item_id
    where l.our_price > 0
      and abs(o.price - l.our_price) / l.our_price * 100 >= ${minGap}
      and (c.id is null or c.compared_at < now() - make_interval(days => ${opts.staleDays ?? 14}))
    order by abs(o.price - l.our_price) / l.our_price desc
    limit ${opts.maxOffers ?? 60}`)
  return rows.rows.map((r) => Number(r.id))
}

/** כל המודעות שבהשוואה בבדיקה אחת (לכפתור "השוואה מעמיקה לכולן") */
export async function comparedOfferIds(checkId: string, limit = 12): Promise<number[]> {
  const o = schema.competitorOffers
  const rows = await db
    .select({ id: o.id })
    .from(o)
    .where(and(eq(o.checkId, checkId), eq(o.compared, true)))
    .orderBy(sql`${o.price} asc nulls last`)
    .limit(limit)
  return rows.map((r) => r.id)
}
