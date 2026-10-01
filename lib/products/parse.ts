import { emptyManualProduct, type ManualProductInput, type ShipInput, type ShipMode } from './manual-shared'

// גוף בקשה → ManualProductInput עם טיפוסים נכונים. שדה חסר מקבל ערך ריק; צורה שגויה → null.

const str = (v: unknown, max = 100_000) => (typeof v === 'string' ? v.slice(0, max) : '')
const strArr = (v: unknown, max = 100) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [])
const ship = (v: unknown): ShipInput => {
  const o = (v ?? {}) as Record<string, unknown>
  const mode: ShipMode = o.mode === 'free' || o.mode === 'none' ? o.mode : 'flat'
  return { mode, cost: str(o.cost, 20).trim(), additional: str(o.additional, 20).trim(), express: o.express === true, expressCost: str(o.expressCost, 20).trim(), expressAdditional: str(o.expressAdditional, 20).trim() }
}

export function parseManualInput(raw: unknown): ManualProductInput | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const e = emptyManualProduct()
  const sh = (o.shipping ?? {}) as Record<string, unknown>
  const dims = (o.dims ?? {}) as Record<string, unknown>
  const specs = (o.specs ?? {}) as Record<string, unknown>
  const qty = Number(o.quantity)
  return {
    title: str(o.title, 400),
    shortDescription: str(o.shortDescription, 5000),
    description: str(o.description, 500_000),
    sku: str(o.sku, 100).trim(),
    price: str(o.price, 20).trim(),
    salePrice: str(o.salePrice, 20).trim(),
    saleFrom: str(o.saleFrom, 10),
    saleTo: str(o.saleTo, 10),
    quantity: Number.isFinite(qty) ? qty : e.quantity,
    brands: Array.from(new Set(strArr(o.brands, 10).map((b) => b.trim().replace(/\s+/g, ' ').slice(0, 100)).filter(Boolean))),
    mpn: str(o.mpn, 200),
    conditionId: str(o.conditionId, 10),
    conditionNotes: str(o.conditionNotes, 2000),
    categorySlugs: strArr(o.categorySlugs, 20),
    tags: strArr(o.tags, 30).map((t) => t.slice(0, 60)),
    specs: { model: str(specs.model, 200).trim(), countryOfOrigin: str(specs.countryOfOrigin, 100).trim(), type: str(specs.type, 200).trim(), expirationDate: str(specs.expirationDate, 7).trim() },
    imageIds: strArr(o.imageIds, 50).filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
    shipping: { us: ship(sh.us), intl: ship(sh.intl), exclude: Array.from(new Set(strArr(sh.exclude, 100).map((x) => x.trim()).filter(Boolean))) },
    dims: { weight: str(dims.weight, 12).trim(), length: str(dims.length, 12).trim(), width: str(dims.width, 12).trim(), height: str(dims.height, 12).trim() },
    faq: (Array.isArray(o.faq) ? o.faq : []).slice(0, 30).map((f) => ({ q: str((f as Record<string, unknown>)?.q, 400), a: str((f as Record<string, unknown>)?.a, 5000) })),
    imageAlts: Object.fromEntries(
      Object.entries(o.imageAlts && typeof o.imageAlts === 'object' ? (o.imageAlts as Record<string, unknown>) : {})
        .filter(([k, v]) => /^[0-9a-f-]{36}$/i.test(k) && typeof v === 'string')
        .slice(0, 50)
        .map(([k, v]) => [k, (v as string).slice(0, 200)]),
    ),
    primaryCategory: str(o.primaryCategory, 100),
  }
}
