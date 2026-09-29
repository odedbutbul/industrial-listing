import { ebayGet } from './rest'

// Sell Fulfillment API — getOrders. קריאה בלבד.
// לא נשמרים פרטי קונה (שם, כתובת, טלפון, אימייל) — רק מה שצריך למלאי ולתצוגה.

type Amount = { value?: string; currency?: string }

interface RawLineItem {
  lineItemId: string
  legacyItemId?: string
  sku?: string
  title?: string
  quantity: number
  lineItemCost?: Amount
  total?: Amount
  lineItemFulfillmentStatus?: string
}

interface RawOrder {
  orderId: string
  creationDate: string
  lastModifiedDate?: string
  orderFulfillmentStatus?: string
  orderPaymentStatus?: string
  cancelStatus?: { cancelState?: string }
  pricingSummary?: { total?: Amount }
  lineItems?: RawLineItem[]
}

export interface EbayOrderLine {
  lineItemId: string
  itemId: string | null
  sku: string | null
  title: string | null
  quantity: number
  lineTotal: string | null
  itemAmount: string | null
  currency: string | null
}

export interface EbayOrder {
  orderId: string
  createdAt: Date
  lastModifiedAt: Date | null
  paymentStatus: string | null
  cancelState: string | null
  fulfillmentStatus: string | null
  total: string | null
  currency: string | null
  lines: EbayOrderLine[]
}

function toOrder(o: RawOrder): EbayOrder {
  return {
    orderId: o.orderId,
    createdAt: new Date(o.creationDate),
    lastModifiedAt: o.lastModifiedDate ? new Date(o.lastModifiedDate) : null,
    paymentStatus: o.orderPaymentStatus ?? null,
    cancelState: o.cancelStatus?.cancelState ?? null,
    fulfillmentStatus: o.orderFulfillmentStatus ?? null,
    total: o.pricingSummary?.total?.value ?? null,
    currency: o.pricingSummary?.total?.currency ?? null,
    lines: (o.lineItems ?? []).map((l) => ({
      lineItemId: l.lineItemId,
      itemId: l.legacyItemId ?? null,
      sku: l.sku?.trim() || null,
      title: l.title ?? null,
      quantity: Number(l.quantity) || 0,
      lineTotal: l.total?.value ?? l.lineItemCost?.value ?? null,
      itemAmount: l.lineItemCost?.value ?? null,
      currency: l.total?.currency ?? l.lineItemCost?.currency ?? null,
    })),
  }
}

/** כל ההזמנות שהשתנו בטווח [from, to]. דפים של 200. */
export async function getOrdersModifiedBetween(from: Date, to: Date, onPage?: (page: number, total: number) => void): Promise<{ orders: EbayOrder[]; calls: number }> {
  const orders: EbayOrder[] = []
  const limit = 200
  let offset = 0
  let calls = 0
  let total = 0
  do {
    const res = await ebayGet<{ orders?: RawOrder[]; total?: number }>('/sell/fulfillment/v1/order', {
      filter: `lastmodifieddate:[${from.toISOString()}..${to.toISOString()}]`,
      limit,
      offset,
    })
    calls++
    total = res.total ?? 0
    orders.push(...(res.orders ?? []).map(toOrder))
    offset += limit
    onPage?.(Math.ceil(offset / limit), Math.max(1, Math.ceil(total / limit)))
  } while (offset < total)
  return { orders, calls }
}
