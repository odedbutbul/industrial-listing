import { sql } from 'drizzle-orm'
import { decryptSecret, hashIdentifier } from '@/lib/crypto'
import { db } from '@/lib/db/client'
import { normalizeEmail } from './upsert'

// שאילתות מסך הלקוחות. קוראות רק מ-Postgres. מייל וטלפון מפוענחים רק לתשובה למנהל (מאחורי הכניסה).
// "פעילה" = הזמנה שלא בוטלה ולא הוחזר עליה כסף. סכומים — USD בלבד.

export type CustomerFilter = 'all' | 'repeat' | 'marketing' | 'ebay' | 'woo'
export const CUSTOMERS_PAGE = 100

const q = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[]
const dec = (v: unknown) => {
  if (!v) return null
  try {
    return decryptSecret(String(v))
  } catch {
    return null
  }
}

/** מותר לדוור: נתן הסכמה, לא הסיר את עצמו, לא נמחק */
const ELIGIBLE = sql`(c.marketing_consent and c.unsubscribed_at is null and c.anonymized_at is null)`

const STATS = sql`
  select o.customer_id,
    count(*) filter (where o.state not in ('cancelled','refunded'))::int orders,
    coalesce(sum(o.total) filter (where o.state not in ('cancelled','refunded') and coalesce(o.currency,'USD') = 'USD'), 0) spent,
    min(o.placed_at) first_order, max(o.placed_at) last_order,
    array_agg(distinct o.channel::text) channels
  from orders o where o.customer_id is not null group by o.customer_id`

export interface CustomerRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  ebayUsername: string | null
  firstChannel: 'ebay' | 'woo'
  channels: string[]
  orders: number
  spent: number
  firstOrder: string | null
  lastOrder: string | null
  marketing: 'eligible' | 'unsubscribed' | 'blocked_ebay' | 'no_consent' | 'anonymized'
}

function toRow(r: Record<string, unknown>): CustomerRow {
  const marketing: CustomerRow['marketing'] = r.anonymized_at
    ? 'anonymized'
    : r.unsubscribed_at
      ? 'unsubscribed'
      : r.marketing_consent
        ? 'eligible'
        : r.marketing_blocked === 'ebay_buyer'
          ? 'blocked_ebay'
          : 'no_consent'
  return {
    id: String(r.id),
    name: (r.name as string) ?? null,
    email: dec(r.email_enc),
    phone: dec(r.phone_enc),
    countryCode: (r.country_code as string) ?? null,
    region: (r.region as string) ?? null,
    city: (r.city as string) ?? null,
    ebayUsername: r.ebay_username && !String(r.ebay_username).startsWith('anon:') ? String(r.ebay_username) : null,
    firstChannel: r.first_channel as 'ebay' | 'woo',
    channels: (r.channels as string[] | null) ?? [],
    orders: Number(r.orders ?? 0),
    spent: Number(r.spent ?? 0),
    firstOrder: r.first_order ? new Date(r.first_order as string).toISOString() : null,
    lastOrder: r.last_order ? new Date(r.last_order as string).toISOString() : null,
    marketing,
  }
}

export async function listCustomers(opts: { q?: string; filter?: CustomerFilter; country?: string; sort?: 'recent' | 'spent' | 'orders'; offset?: number }) {
  const conds: ReturnType<typeof sql>[] = []
  const f = opts.filter ?? 'all'
  if (f === 'repeat') conds.push(sql`coalesce(s.orders, 0) >= 2`)
  if (f === 'marketing') conds.push(ELIGIBLE)
  if (f === 'ebay') conds.push(sql`'ebay' = any(s.channels)`)
  if (f === 'woo') conds.push(sql`'woo' = any(s.channels)`)
  if (opts.country && /^[A-Z]{2}$/.test(opts.country)) conds.push(sql`c.country_code = ${opts.country}`)
  const term = opts.q?.trim()
  if (term) {
    const like = `%${term}%`
    // מייל מוצפן — חיפוש לפי מייל מלא בלבד (hash)
    const byEmail = term.includes('@') ? sql` or c.email_hash = ${hashIdentifier(normalizeEmail(term))}` : sql``
    conds.push(sql`(c.name ilike ${like} or c.ebay_username ilike ${like} or c.city ilike ${like} or exists (select 1 from orders o2 where o2.customer_id = c.id and o2.external_order_id ilike ${like})${byEmail})`)
  }
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``
  const order = opts.sort === 'spent' ? sql`s.spent desc nulls last, c.id` : opts.sort === 'orders' ? sql`s.orders desc nulls last, c.id` : sql`s.last_order desc nulls last, c.id`
  const offset = Math.max(0, opts.offset ?? 0)

  const rows = await q<Record<string, unknown>>(sql`
    select c.*, s.orders, s.spent, s.first_order, s.last_order, s.channels
    from customers c left join (${STATS}) s on s.customer_id = c.id
    ${where} order by ${order} limit ${CUSTOMERS_PAGE + 1} offset ${offset}`)

  const [counts] = await q<Record<string, number>>(sql`
    select count(*)::int total,
      count(*) filter (where coalesce(s.orders,0) >= 2)::int repeat,
      count(*) filter (where ${ELIGIBLE})::int marketing,
      count(*) filter (where 'ebay' = any(s.channels))::int ebay,
      count(*) filter (where 'woo' = any(s.channels))::int woo,
      count(distinct c.country_code)::int countries,
      count(*) filter (where s.first_order > now() - interval '30 days')::int new30
    from customers c left join (${STATS}) s on s.customer_id = c.id`)

  return {
    rows: rows.slice(0, CUSTOMERS_PAGE).map(toRow),
    nextOffset: rows.length > CUSTOMERS_PAGE ? offset + CUSTOMERS_PAGE : null,
    counts,
  }
}

export interface CountryStat {
  countryCode: string | null
  customers: number
  repeat: number
  orders: number
  revenue: number
}

/** לקוחות, הזמנות והכנסות לפי מדינה — מדינת הלקוח (ההזמנה האחרונה) */
export async function customersByCountry(): Promise<CountryStat[]> {
  const rows = await q<Record<string, unknown>>(sql`
    select c.country_code, count(*)::int customers,
      count(*) filter (where coalesce(s.orders,0) >= 2)::int repeat,
      coalesce(sum(s.orders),0)::int orders, coalesce(sum(s.spent),0) revenue
    from customers c left join (${STATS}) s on s.customer_id = c.id
    group by c.country_code order by 2 desc, 5 desc`)
  return rows.map((r) => ({ countryCode: (r.country_code as string) ?? null, customers: Number(r.customers), repeat: Number(r.repeat), orders: Number(r.orders), revenue: Number(r.revenue) }))
}

export async function getCustomer(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [r] = await q<Record<string, unknown>>(sql`
    select c.*, s.orders, s.spent, s.first_order, s.last_order, s.channels
    from customers c left join (${STATS}) s on s.customer_id = c.id where c.id = ${id}`)
  if (!r) return null
  const orders = await q<Record<string, unknown>>(sql`
    select o.id, o.channel, o.external_order_id, o.state, o.placed_at, o.total, o.currency, o.ship_country,
      coalesce(json_agg(json_build_object('title', coalesce(p.title, po.title), 'productId', po.product_id, 'sku', po.sku, 'quantity', po.quantity, 'lineTotal', po.line_total)
        order by po.id) filter (where po.id is not null), '[]') lines
    from orders o
    left join processed_orders po on po.channel = o.channel and po.external_order_id = o.external_order_id
    left join products p on p.id = po.product_id
    where o.customer_id = ${id}
    group by o.id order by o.placed_at desc`)
  return {
    customer: {
      ...toRow(r),
      consentSource: (r.consent_source as string) ?? null,
      consentAt: r.consent_at ? new Date(r.consent_at as string).toISOString() : null,
      consentNote: (r.consent_note as string) ?? null,
      unsubscribedAt: r.unsubscribed_at ? new Date(r.unsubscribed_at as string).toISOString() : null,
      anonymizedAt: r.anonymized_at ? new Date(r.anonymized_at as string).toISOString() : null,
      createdAt: new Date(r.created_at as string).toISOString(),
    },
    orders: orders.map((o) => ({
      id: String(o.id),
      channel: o.channel as 'ebay' | 'woo',
      orderId: String(o.external_order_id),
      state: String(o.state),
      placedAt: new Date(o.placed_at as string).toISOString(),
      total: o.total === null ? null : String(o.total),
      currency: (o.currency as string) ?? null,
      shipCountry: (o.ship_country as string) ?? null,
      lines: o.lines as { title: string | null; productId: string | null; sku: string | null; quantity: number; lineTotal: string | null }[],
    })),
  }
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>
