import { eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

// רישום אירועי התנהלות של לקוח (ביטול, החזר כספי, החזרה, פנייה, קייס) → customer_cases.
// משיכה חוזרת מעדכנת את אותה שורה. ערך חסר במקור אחד לא מוחק ערך שהגיע ממקור אחר (coalesce).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

export type CaseKind = 'cancellation' | 'refund' | 'return' | 'inquiry' | 'case'

export interface CaseInput {
  channel: 'ebay' | 'woo'
  kind: CaseKind
  externalId: string
  externalOrderId: string | null
  customerId?: string | null
  buyerUsername?: string | null
  initiator: 'buyer' | 'seller' | 'ebay' | null
  status: string | null
  isOpen: boolean
  reason: string | null
  comment?: string | null
  amount: string | number | null
  currency: string | null
  itemId?: string | null
  openedAt: Date
  closedAt: Date | null
  source: 'fulfillment' | 'post_order'
}

const cc = schema.customerCases

/** השורה הקיימת שייכת ללקוח שביקש מחיקה */
const FORGOTTEN = sql`(${cc.customerId} is not null and exists (select 1 from customers x where x.id = ${cc.customerId} and x.anonymized_at is not null))`

/** סכום תקין או null ("" / NaN לא נכנסים לעמודה המספרית) */
const amountOf = (v: string | number | null) => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : String(Number(v)))

export async function upsertCase(ex: Executor, c: CaseInput): Promise<'created' | 'updated'> {
  // לקוח שביקש מחיקה — לא שומרים שוב את שם המשתמש וההערה שלו
  let forget = false
  if (c.customerId && (c.buyerUsername || c.comment)) {
    const cust = await ex.query.customers.findFirst({ where: eq(schema.customers.id, c.customerId), columns: { anonymizedAt: true } })
    forget = !!cust?.anonymizedAt
  }
  const values = {
    channel: c.channel,
    kind: c.kind,
    externalId: c.externalId,
    externalOrderId: c.externalOrderId,
    customerId: c.customerId ?? null,
    buyerUsername: forget ? null : c.buyerUsername?.trim() || null,
    initiator: c.initiator,
    status: c.status,
    isOpen: c.isOpen,
    reason: c.reason,
    comment: !forget && c.comment ? c.comment.trim().slice(0, 500) || null : null,
    amount: amountOf(c.amount),
    currency: c.currency,
    itemId: c.itemId ?? null,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    source: c.source,
  }
  const [row] = await ex
    .insert(cc)
    .values(values)
    .onConflictDoUpdate({
      target: [cc.channel, cc.kind, cc.externalId],
      set: {
        externalOrderId: sql`coalesce(excluded.external_order_id, ${cc.externalOrderId})`,
        customerId: sql`coalesce(excluded.customer_id, ${cc.customerId})`,
        // שם משתמש והערה לא חוזרים לשורה של לקוח שביקש מחיקה
        buyerUsername: sql`case when ${FORGOTTEN} then null else coalesce(excluded.buyer_username, ${cc.buyerUsername}) end`,
        initiator: sql`coalesce(excluded.initiator, ${cc.initiator})`,
        status: sql`coalesce(excluded.status, ${cc.status})`,
        isOpen: sql`excluded.is_open`,
        reason: sql`coalesce(excluded.reason, ${cc.reason})`,
        comment: sql`case when ${FORGOTTEN} then null else coalesce(excluded.comment, ${cc.comment}) end`,
        amount: sql`coalesce(excluded.amount, ${cc.amount})`,
        currency: sql`coalesce(excluded.currency, ${cc.currency})`,
        itemId: sql`coalesce(excluded.item_id, ${cc.itemId})`,
        // המועד המוקדם ביותר שראינו — הבקשה הראשונה
        openedAt: sql`least(excluded.opened_at, ${cc.openedAt})`,
        closedAt: sql`coalesce(excluded.closed_at, ${cc.closedAt})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ created: sql<boolean>`(xmax = 0)` })
  return row?.created ? 'created' : 'updated'
}

/**
 * מקשר אירועים בלי לקוח: קודם לפי מספר ההזמנה, אחר כך לפי שם המשתמש ב-eBay,
 * ואם יש לקוח אבל אין הזמנה — לפי מספר המודעה בהזמנות של אותו לקוח.
 */
export async function linkCases(ex: Executor = db): Promise<number> {
  const byOrder = await ex.execute(sql`
    update customer_cases k set customer_id = o.customer_id, updated_at = now()
    from orders o
    where k.customer_id is null and k.external_order_id is not null
      and o.channel = k.channel and o.external_order_id = k.external_order_id and o.customer_id is not null`)
  const byUser = await ex.execute(sql`
    update customer_cases k set customer_id = c.id, updated_at = now()
    from customers c
    where k.customer_id is null and k.buyer_username is not null and k.channel = 'ebay'
      and lower(c.ebay_username) = lower(k.buyer_username)`)
  // הזמנה לפי מודעה: רק כשיש התאמה אחת בדיוק אצל אותו לקוח
  await ex.execute(sql`
    update customer_cases k set external_order_id = m.external_order_id, updated_at = now()
    from (
      select k2.id, min(po.external_order_id) external_order_id
      from customer_cases k2
      join orders o on o.customer_id = k2.customer_id and o.channel = k2.channel
      join processed_orders po on po.channel = o.channel and po.external_order_id = o.external_order_id and po.external_item_id = k2.item_id
      where k2.external_order_id is null and k2.item_id is not null and k2.customer_id is not null
      group by k2.id having count(distinct po.external_order_id) = 1
    ) m
    where k.id = m.id`)
  return (byOrder.rowCount ?? 0) + (byUser.rowCount ?? 0)
}

/**
 * ההזמנה של אירוע שאין לו מספר הזמנה: ההזמנה האחרונה של אותה מודעה שנוצרה עד יום אחרי פתיחת האירוע.
 * רוב הפריטים הם יחידה אחת, כך שמודעה + תאריך מזהים את ההזמנה.
 */
export async function orderByItem(ex: Executor, channel: 'ebay' | 'woo', itemId: string, openedAt: Date): Promise<{ orderId: string; customerId: string | null } | null> {
  const r = await ex.execute(sql`
    select o.external_order_id, o.customer_id from processed_orders po
    join orders o on o.channel = po.channel and o.external_order_id = po.external_order_id
    where po.channel = ${channel} and po.external_item_id = ${itemId} and o.placed_at <= ${new Date(openedAt.getTime() + 86400_000)}
    order by o.placed_at desc limit 1`)
  const row = r.rows[0] as { external_order_id: string; customer_id: string | null } | undefined
  return row ? { orderId: row.external_order_id, customerId: row.customer_id } : null
}

/** במחיקת פרטים: שם המשתמש נמחק גם מהאירועים */
export async function forgetCaseUsernames(ex: Executor, customerId: string) {
  await ex.update(cc).set({ buyerUsername: null, comment: null, updatedAt: sql`now()` }).where(eq(cc.customerId, customerId))
}

/** אירועים שעדיין לא קושרו — לתצוגה בלוג / בבדיקה */
export async function unlinkedCount(ex: Executor = db): Promise<number> {
  const [r] = await ex.select({ n: sql<number>`count(*)::int` }).from(cc).where(isNull(cc.customerId))
  return r?.n ?? 0
}
