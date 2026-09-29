import { eq, sql } from 'drizzle-orm'
import { encryptSecret, hashIdentifier } from '@/lib/crypto'
import { db, schema } from '@/lib/db/client'

// יצירה / עדכון של לקוח מתוך הזמנה. נקרא בתוך הטרנזקציה של קליטת ההזמנה.
// זיהוי: קודם לפי מייל (hash), אחר כך לפי שם המשתמש ב-eBay. מייל-ממסר של eBay לא משמש לזיהוי.
// פרטים מהזמנה ישנה לא דורסים פרטים מהזמנה חדשה יותר (details_from_at).
// דיוור: קונה חדש מ-eBay נחסם לדיוור (מדיניות eBay). הסכמה בקופה של האתר פותחת אותו.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Channel = (typeof schema.channelEnum.enumValues)[number]

export interface CustomerInput {
  channel: Channel
  placedAt: Date
  name: string | null
  email: string | null
  phone: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  ebayUsername: string | null
  /** הסכמה שניתנה בהזמנה הזו (תיבת הסימון בקופה) */
  consent?: { given: boolean; source: 'woo_checkout'; at: Date } | null
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase()

/** מה שנשאר משם המשתמש ב-eBay אחרי בקשת מחיקה — לא הפיך */
export const anonUsername = (u: string) => `anon:${hashIdentifier('ebay-username:' + u.trim())}`

/** כתובות ממסר / מוסתרות של eBay — לא אדם מזוהה, לא לזיהוי ולא לדיוור */
export const isRelayEmail = (e: string) => /@(members\.)?ebay\.[a-z.]+$/i.test(e) || /^(invalid|unknown)/i.test(e)

export async function upsertCustomer(tx: Tx, input: CustomerInput): Promise<string | null> {
  const email = input.email ? normalizeEmail(input.email) : null
  const emailHash = email && !isRelayEmail(email) ? hashIdentifier(email) : null
  const username = input.ebayUsername?.trim() || null
  if (!emailHash && !username) return null

  const c = schema.customers
  let existing = emailHash ? await tx.query.customers.findFirst({ where: eq(c.emailHash, emailHash) }) : undefined
  if (!existing && username) existing = await tx.query.customers.findFirst({ where: eq(c.ebayUsername, username) })
  // לקוח שנמחק: נשאר רק סימון חד-כיווני, כדי שקליטה חוזרת של הזמנות ישנות לא תיצור אותו מחדש
  if (!existing && username) existing = await tx.query.customers.findFirst({ where: eq(c.ebayUsername, anonUsername(username)) })

  const details = {
    name: input.name,
    emailEnc: email ? encryptSecret(email) : null,
    phoneEnc: input.phone ? encryptSecret(input.phone) : null,
    countryCode: input.countryCode,
    region: input.region,
    city: input.city,
  }

  if (!existing) {
    const [row] = await tx
      .insert(c)
      .values({
        ...details,
        emailHash,
        ebayUsername: username,
        firstChannel: input.channel,
        detailsFromAt: input.placedAt,
        marketingBlocked: input.channel === 'ebay' && !input.consent?.given ? 'ebay_buyer' : null,
        ...(input.consent?.given ? { marketingConsent: true, consentSource: input.consent.source, consentAt: input.consent.at, marketingBlocked: null } : {}),
      })
      .returning({ id: c.id })
    return row.id
  }

  // לקוח שביקש מחיקה — לא ממלאים מחדש פרטים אישיים
  if (existing.anonymizedAt) return existing.id

  const newer = !existing.detailsFromAt || input.placedAt >= existing.detailsFromAt
  const set: Partial<typeof c.$inferInsert> = {}
  if (newer) {
    // ערך חסר בהזמנה החדשה לא מוחק ערך קיים
    for (const [k, v] of Object.entries(details) as [keyof typeof details, string | null][]) if (v !== null) (set as Record<string, unknown>)[k] = v
    set.detailsFromAt = input.placedAt
  }
  if (!existing.emailHash && emailHash) set.emailHash = emailHash
  if (!existing.ebayUsername && username) set.ebayUsername = username
  if (input.consent?.given && !existing.marketingConsent && !existing.unsubscribedAt) {
    Object.assign(set, { marketingConsent: true, consentSource: input.consent.source, consentAt: input.consent.at, marketingBlocked: null })
  }
  if (Object.keys(set).length) await tx.update(c).set({ ...set, updatedAt: sql`now()` }).where(eq(c.id, existing.id))
  return existing.id
}
