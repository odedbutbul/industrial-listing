import { ebayGet } from './rest'

// Sell Fulfillment API — getOrders. קריאה בלבד.
// פרטי קונה (החלטת עודד 29/09/2026): שם, מייל, טלפון, מדינה / מחוז / עיר ושם המשתמש ב-eBay — בלי כתובת רחוב ומיקוד.
// הם נשמרים ב-customers (מייל וטלפון מוצפנים), לא ב-orders ולא ב-sync_log.

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

interface RawAddress {
  city?: string
  stateOrProvince?: string
  countryCode?: string
}

interface RawContact {
  fullName?: string
  email?: string
  primaryPhone?: { phoneNumber?: string }
  contactAddress?: RawAddress
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
  buyer?: { username?: string; taxAddress?: RawAddress; buyerRegistrationAddress?: RawContact }
  fulfillmentStartInstructions?: { shippingStep?: { shipTo?: RawContact } }[]
}

/** פרטי הקונה כפי שהם מגיעים מ-eBay — רק השדות שהוחלט לשמור */
export interface EbayBuyer {
  username: string | null
  name: string | null
  email: string | null
  phone: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  /** מדינת המשלוח של ההזמנה הזו */
  shipCountry: string | null
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
  buyer: EbayBuyer | null
}

const clean = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null)

function toBuyer(o: RawOrder): EbayBuyer | null {
  const reg = o.buyer?.buyerRegistrationAddress
  const ship = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo
  const addr = ship?.contactAddress ?? reg?.contactAddress ?? o.buyer?.taxAddress
  const b: EbayBuyer = {
    username: clean(o.buyer?.username),
    name: clean(reg?.fullName) ?? clean(ship?.fullName),
    email: clean(reg?.email) ?? clean(ship?.email),
    phone: clean(reg?.primaryPhone?.phoneNumber) ?? clean(ship?.primaryPhone?.phoneNumber),
    countryCode: clean(addr?.countryCode)?.toUpperCase() ?? null,
    region: clean(addr?.stateOrProvince),
    city: clean(addr?.city),
    shipCountry: clean(ship?.contactAddress?.countryCode)?.toUpperCase() ?? null,
  }
  return b.username || b.email ? b : null
}

function toOrder(o: RawOrder): EbayOrder {
  return {
    buyer: toBuyer(o),
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
