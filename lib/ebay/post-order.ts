import { getValidAccessToken } from './auth'
import { getEbayConfig } from './config'
import { assertEbayRestAllowed } from './guard'
import { initiatorOf } from './fulfillment'
import { EbayApiError } from './trading'

// Post-Order API v2 — החזרות, פניות ("לא קיבלתי"), קייסים וביטולים של החשבון כמוכרת. קריאה בלבד (GET, דרך guard).
// הזדהות: OAuth של המשתמש עם קידומת IAF (לפי תיעוד eBay). שמות השדות לפי התיעוד — לא נבדקו בחשבון,
// לכן הקריאה סלחנית: כל שדה נקרא מכמה שמות אפשריים, ושורה בלי מזהה או תאריך מדולגת.

type Obj = Record<string, unknown>
const POST_ORDER = '/post-order/v2'
const MAX_PAGES = 50

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Obj)[k] : undefined), o)
const first = (o: unknown, ...paths: string[]) => {
  for (const p of paths) {
    const v = get(o, p)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}
const str = (o: unknown, ...paths: string[]): string | null => {
  const v = first(o, ...paths)
  return v === undefined || typeof v === 'object' ? null : String(v).trim() || null
}
/** תאריך ב-Post-Order מגיע כ-{ value: "…" } או כמחרוזת */
const when = (o: unknown, ...paths: string[]): Date | null => {
  for (const p of paths) {
    const v = get(o, p)
    const raw = v && typeof v === 'object' ? (v as Obj).value : v
    if (typeof raw === 'string' && raw) {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) return d
    }
  }
  return null
}
const money = (o: unknown, ...paths: string[]): { amount: string | null; currency: string | null } => {
  for (const p of paths) {
    const v = get(o, p) as Obj | undefined
    if (v && typeof v === 'object' && v.value !== undefined && v.value !== null) return { amount: String(v.value), currency: v.currency ? String(v.currency) : null }
  }
  return { amount: null, currency: null }
}

export interface PostOrderCase {
  kind: 'return' | 'inquiry' | 'case' | 'cancellation'
  externalId: string
  orderId: string | null
  itemId: string | null
  buyerUsername: string | null
  initiator: 'buyer' | 'seller' | 'ebay' | null
  status: string | null
  isOpen: boolean
  reason: string | null
  comment: string | null
  amount: string | null
  currency: string | null
  openedAt: Date
  closedAt: Date | null
}

const CLOSED = /CLOSED|CANCELLED|CANCELED|COMPLETED|REFUND_ISSUED|REJECTED|WITHDRAWN|EXPIRED|RESOLVED/i

async function postOrderGet<T>(path: string, query: Record<string, string | number>): Promise<T> {
  const full = `${POST_ORDER}${path}`
  assertEbayRestAllowed('GET', full)
  const config = getEbayConfig()
  const token = await getValidAccessToken()
  const url = new URL(full, config.apiBase)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `IAF ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    signal: AbortSignal.timeout(30000),
  })
  const data = (await res.json().catch(() => null)) as Obj | null
  if (!res.ok) {
    const e = ((data?.error ?? data?.errors) as Obj[] | undefined)?.[0]
    throw new EbayApiError(String(e?.longMessage ?? e?.message ?? `eBay HTTP ${res.status}`), `GET ${full}`, (data?.error ?? data?.errors ?? []) as unknown[])
  }
  return (data ?? {}) as T
}

/** חיפוש עם דפים (offset = מספר הדף, מ-1). עוצר בדף ריק, בדף האחרון, או אם eBay מחזיר שוב את אותו דף. */
async function searchAll(path: string, listKeys: string[], query: Record<string, string | number>, idOf: (m: Obj) => string | null): Promise<{ members: Obj[]; calls: number }> {
  const limit = 200
  const members: Obj[] = []
  let calls = 0
  let prevFirst: string | null = null
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await postOrderGet<Obj>(path, { ...query, limit, offset: page })
    calls++
    const list = (listKeys.map((k) => r[k]).find(Array.isArray) as Obj[] | undefined) ?? []
    if (!list.length) break
    const firstId = idOf(list[0])
    if (firstId && firstId === prevFirst) break
    prevFirst = firstId
    members.push(...list)
    const totalPages = Number(get(r, 'paginationOutput.totalPages') ?? get(r, 'paginationOutput.totalPage'))
    if ((Number.isFinite(totalPages) && page >= totalPages) || list.length < limit) break
  }
  return { members, calls }
}

const iso = (d: Date) => d.toISOString()

function toReturn(m: Obj): PostOrderCase | null {
  const id = str(m, 'returnId')
  const opened = when(m, 'creationInfo.creationDate', 'creationDate')
  if (!id || !opened) return null
  const status = str(m, 'state', 'status')
  const refund = money(m, 'sellerTotalRefund.actualRefundAmount', 'buyerTotalRefund.actualRefundAmount', 'sellerTotalRefund.estimatedRefundAmount', 'buyerTotalRefund.estimatedRefundAmount')
  const closedAt = when(m, 'closeInfo.returnCloseDate', 'closeInfo.closeDate')
  return {
    kind: 'return',
    externalId: id,
    orderId: str(m, 'orderId'),
    itemId: str(m, 'creationInfo.item.itemId', 'itemId'),
    buyerUsername: str(m, 'buyerLoginName', 'buyer'),
    initiator: 'buyer',
    status,
    isOpen: !closedAt && !CLOSED.test(status ?? ''),
    reason: str(m, 'creationInfo.reason', 'reason'),
    comment: str(m, 'creationInfo.comments.content', 'creationInfo.comments'),
    ...refund,
    openedAt: opened,
    closedAt,
  }
}

function toInquiry(m: Obj, kind: 'inquiry' | 'case'): PostOrderCase | null {
  const id = kind === 'case' ? str(m, 'caseId', 'inquiryId') : str(m, 'inquiryId')
  const opened = when(m, 'creationDate', 'creationInfo.creationDate')
  if (!id || !opened) return null
  const status = kind === 'case' ? str(m, 'caseStatusEnum', 'status', 'caseStatus') : str(m, 'inquiryStatusEnum', 'status', 'inquiryStatus')
  const closedAt = CLOSED.test(status ?? '') ? when(m, 'closeDate', 'lastModifiedDate') : null
  const claim = money(m, 'claimAmount')
  return {
    kind,
    externalId: id,
    orderId: str(m, 'orderId', 'legacyOrderId'),
    itemId: str(m, 'itemId'),
    buyerUsername: str(m, 'buyer', 'buyerLoginName'),
    initiator: 'buyer',
    status,
    isOpen: !CLOSED.test(status ?? ''),
    reason: kind === 'case' ? str(m, 'caseType') : 'ITEM_NOT_RECEIVED',
    comment: null,
    ...claim,
    openedAt: opened,
    closedAt,
  }
}

/** מזהה הזמנה ישן של eBay: itemId-transactionId (Post-Order מחזיר אותו בביטולים — נבדק 02/10/2026) */
export const LEGACY_ORDER = /^(\d{9,})-(\d+)$/

function toCancellation(m: Obj): PostOrderCase | null {
  const raw = str(m, 'orderId', 'legacyOrderId')
  const opened = when(m, 'cancelRequestDate', 'creationDate')
  if (!raw || !opened) return null
  // מזהה ישן: מספר המודעה נשמר, ההזמנה נמצאת לפיו לפני השמירה (history.ts)
  const legacy = raw.match(LEGACY_ORDER)
  const orderId = legacy ? null : raw
  const status = str(m, 'cancelState', 'cancelStatus')
  const closedAt = when(m, 'cancelCloseDate')
  const refund = money(m, 'requestRefundAmount', 'refundAmount')
  return {
    kind: 'cancellation',
    // ביטול אחד להזמנה — אותו מפתח כמו ב-Fulfillment, כדי ששני המקורות יתאחדו
    externalId: orderId ?? `legacy:${raw}`,
    orderId,
    itemId: legacy ? legacy[1] : null,
    buyerUsername: str(m, 'buyerLoginName', 'buyer'),
    initiator: initiatorOf(str(m, 'requestorType', 'cancelInitiator')),
    status,
    isOpen: !closedAt && !CLOSED.test(status ?? ''),
    reason: str(m, 'cancelReason', 'cancelCloseReason'),
    comment: null,
    ...refund,
    openedAt: opened,
    closedAt,
  }
}

export interface PostOrderResult {
  cases: PostOrderCase[]
  calls: number
  /** endpoint שנכשל לא מפיל את האחרים */
  errors: { kind: PostOrderCase['kind']; error: string }[]
}

/** כל ההחזרות, הפניות, הקייסים והביטולים שנפתחו בטווח, בחלונות של windowDays (טווח ארוך מדי נדחה ע"י eBay — לא נבדק מה המקסימום). */
export async function searchPostOrder(from: Date, to: Date, windowDays = 90): Promise<PostOrderResult> {
  const out: PostOrderResult = { cases: [], calls: 0, errors: [] }
  const windows: [Date, Date][] = []
  for (let s = from.getTime(); s < to.getTime(); s += windowDays * 86400_000) windows.push([new Date(s), new Date(Math.min(to.getTime(), s + windowDays * 86400_000))])

  const endpoints: { kind: PostOrderCase['kind']; path: string; list: string[]; range: [string, string]; extra?: Record<string, string>; id: (m: Obj) => string | null; map: (m: Obj) => PostOrderCase | null }[] = [
    { kind: 'return', path: '/return/search', list: ['members'], range: ['creation_date_range_from', 'creation_date_range_to'], extra: { role: 'SELLER' }, id: (m) => str(m, 'returnId'), map: toReturn },
    { kind: 'inquiry', path: '/inquiry/search', list: ['members'], range: ['inquiry_creation_date_range_from', 'inquiry_creation_date_range_to'], id: (m) => str(m, 'inquiryId'), map: (m) => toInquiry(m, 'inquiry') },
    { kind: 'case', path: '/casemanagement/search', list: ['members', 'cases'], range: ['case_creation_date_range_from', 'case_creation_date_range_to'], id: (m) => str(m, 'caseId'), map: (m) => toInquiry(m, 'case') },
    { kind: 'cancellation', path: '/cancellation/search', list: ['cancellations', 'members'], range: ['creation_date_range_from', 'creation_date_range_to'], id: (m) => str(m, 'cancelId'), map: toCancellation },
  ]

  for (const ep of endpoints) {
    try {
      for (const [a, b] of windows) {
        const r = await searchAll(ep.path, ep.list, { ...(ep.extra ?? {}), [ep.range[0]]: iso(a), [ep.range[1]]: iso(b) }, ep.id)
        out.calls += r.calls
        for (const m of r.members) {
          const c = ep.map(m)
          if (c) out.cases.push(c)
        }
      }
    } catch (err) {
      out.errors.push({ kind: ep.kind, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}
