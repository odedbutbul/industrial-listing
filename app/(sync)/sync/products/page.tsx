'use client'

import Link from 'next/link'
import { ZoomThumb } from '@/components/sync/Lightbox'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { Download, FileDown, ImageOff, PackagePlus, Search, Store, Truck } from 'lucide-react'
import { api, openImport } from '@/components/sync/api'
import { MISMATCH, money, num, shipPrice, shipIsMoney, stockStatus, SYNC_OFF, WOO_NOT_LINKED } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { ProductRow } from '@/components/sync/types'
import { SendToStoreDialog } from '@/components/sync/SendToStoreDialog'
import { ShippingToStoreDialog } from '@/components/sync/ShippingToStoreDialog'
import { WooLink } from '@/components/sync/WooLink'
import { EmptyState, LoadError, Pill, Seg, Spin, useLoad } from '@/components/sync/ui'

type Page = { products: ProductRow[]; total: number; inStock: number; nextOffset: number | null }
type Filter = 'all' | 'in_stock' | 'sold_out' | 'mismatch' | 'no_woo' | 'ready' | 'in_woo' | 'manual'
const FILTERS: [Filter, string][] = [
  ['all', 'הכל'],
  ['in_stock', 'במלאי'],
  ['sold_out', 'אזלו'],
  ['mismatch', 'פערים מול eBay'],
  ['no_woo', 'לא מקושרים לאתר'],
  ['ready', 'מוכנים לחנות'],
  ['in_woo', 'בחנות'],
  ['manual', 'ידניים'],
]

/** כמה מוצרים אפשר לשלוח לחנות בפעם אחת (כמו MAX_SELECTION בשרת) */
const MAX_SEND = 200

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="ax-skel" />}>
      <Products />
    </Suspense>
  )
}

function Products() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const filter = (FILTERS.find(([f]) => f === params.get('filter'))?.[0] ?? 'all') as Filter
  const q = params.get('q') ?? ''
  const [query, setQuery] = useState(q)
  useEffect(() => setQuery(q), [q])

  const setParams = useCallback(
    (next: { filter?: Filter; q?: string }) => {
      const sp = new URLSearchParams(params.toString())
      const f = next.filter ?? filter
      const qq = next.q ?? q
      if (f === 'all') sp.delete('filter')
      else sp.set('filter', f)
      if (qq) sp.set('q', qq)
      else sp.delete('q')
      router.replace(`${pathname}${sp.toString() ? '?' + sp.toString() : ''}`)
    },
    [params, filter, q, router, pathname],
  )

  // חיפוש: מתעדכן ב-URL חצי שנייה אחרי שמפסיקים להקליד
  useEffect(() => {
    if (query === q) return
    const t = window.setTimeout(() => setParams({ q: query.trim() }), 400)
    return () => window.clearTimeout(t)
  }, [query, q, setParams])

  const [more, setMore] = useState<ProductRow[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  // בחירת מוצרים לשליחה לחנות — תמיד בבחירה ידנית
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [shippingOpen, setShippingOpen] = useState(false)
  useEffect(() => setSelected(new Set()), [filter, q])
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_SEND) next.add(id)
      return next
    })

  const url = (offset = 0) => `/api/sync/products?filter=${filter}&q=${encodeURIComponent(q)}${offset ? `&offset=${offset}` : ''}`
  const { data, error, reload } = useLoad(async () => {
    const r = await api.get<Page>(url())
    setMore([])
    setNextOffset(r.nextOffset)
    return r
  }, [filter, q])
  useDataChanged(reload)

  const loadMore = async () => {
    if (nextOffset === null) return
    setLoadingMore(true)
    try {
      const r = await api.get<Page>(url(nextOffset))
      setMore((m) => [...m, ...r.products])
      setNextOffset(r.nextOffset)
    } finally {
      setLoadingMore(false)
    }
  }

  const rows = data ? [...data.products, ...more] : undefined
  const filtered = filter !== 'all' || !!q
  // מוצר ידני נשלח לחנות מהטופס שלו, לא מהשליחה המרוכזת
  const selectable = (rows ?? []).filter((r) => !r.wooProductId && r.source !== 'manual')
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.slice(0, MAX_SEND).map((r) => r.id)))

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">מוצרים</h1>
          <p className="ax-sub">{!data ? ' ' : filtered ? `${num(data.total)} תוצאות` : `${num(data.total)} מוצרים · ${num(data.inStock)} במלאי`}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a className="ax-btn" href="/api/sync/products/shipping-csv" download>
            <FileDown size={18} aria-hidden="true" />
            מחירי משלוח (CSV)
          </a>
          <Link className="ax-btn is-primary" href="/sync/products/new">
            <PackagePlus size={18} aria-hidden="true" />
            העלאת מוצר
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Seg label="סינון מוצרים" options={FILTERS} value={filter} onChange={(f) => setParams({ filter: f })} />
        <div className="ax-search" style={{ minWidth: 220 }} role="search">
          <Search size={18} aria-hidden="true" />
          <input type="search" className="ax-input" aria-label="חיפוש מוצר" placeholder="כותרת, SKU, מספר מודעה או MPN" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !rows ? (
        <div className="ax-skel" style={{ height: 320 }} />
      ) : rows.length === 0 && !filtered ? (
        <EmptyState
          icon={Download}
          title="עדיין אין מוצרים"
          text="מייבאים את המודעות הפעילות מ-eBay — קודם תצוגה מקדימה, ושום דבר לא משתנה ב-eBay. אפשר גם להעלות מוצר ידני לחנות."
          action={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="ax-btn is-primary" onClick={openImport}>
                <Download size={18} aria-hidden="true" />
                ייבוא מ-eBay
              </button>
              <Link className="ax-btn" href="/sync/products/new">
                <PackagePlus size={18} aria-hidden="true" />
                העלאת מוצר
              </Link>
            </div>
          }
        />
      ) : rows.length === 0 ? (
        <div className="ax-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingInlineEnd: 20 }}>
          <p className="ax-note">אין מוצרים שמתאימים לסינון.</p>
          <button type="button" className="ax-btn is-link" onClick={() => (setQuery(''), setParams({ filter: 'all', q: '' }))}>
            ניקוי הסינון
          </button>
        </div>
      ) : (
        <>
          {filter === 'in_woo' && (
            <div className="ax-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 20px' }}>
              <span className="ax-hint" style={{ flex: '1 1 220px' }}>
                מעדכן בכל המוצרים שבחנות את המחיר ואת מחירי המשלוח כמו ב-eBay — רק מה שהשתנה. קודם תצוגה מקדימה. רץ גם אוטומטית כל בוקר.
              </span>
              <button type="button" className="ax-btn is-primary" onClick={() => setShippingOpen(true)}>
                <Truck size={18} aria-hidden="true" />
                עדכון מחירים ומשלוח בחנות
              </button>
            </div>
          )}
          {filter !== 'in_woo' && (
            <div className="ax-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 20px' }}>
            <label className="ax-check" style={{ minHeight: 44 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectable.length} />
              בחירת כל המוצגים שעוד לא בחנות
            </label>
            <span className="ax-hint" role="status" style={{ flex: "1 1 220px" }}>
              {selected.size ? (
                <>
                  נבחרו <span className="ax-num">{num(selected.size)}</span>
                  {selected.size >= MAX_SEND && ` (מקסימום ${MAX_SEND} בפעם אחת)`}
                </>
              ) : (
                'בוחרים מוצרים ושולחים אותם לחנות כטיוטות'
              )}
            </span>
            {selected.size > 0 && (
              <button type="button" className="ax-btn is-link" onClick={() => setSelected(new Set())}>
                ניקוי הבחירה
              </button>
            )}
            <button type="button" className="ax-btn is-primary" disabled={!selected.size} onClick={() => setSending(true)}>
              <Store size={18} aria-hidden="true" />
              שליחה לחנות
            </button>
            </div>
          )}
          <section className="ax-card" aria-label="רשימת מוצרים">
            <div className="ax-only-desktop">
              <div className="ax-table-wrap">
                <table className="ax-table" style={{ minWidth: 1080 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>
                        <span className="ax-sr">בחירה</span>
                      </th>
                      <th>מוצר</th>
                      <th>SKU</th>
                      <th>מודעת eBay</th>
                      <th>מלאי</th>
                      <th>ב-eBay</th>
                      <th>מחיר</th>
                      <th>משלוח ארה״ב</th>
                      <th>משלוח לעולם</th>
                      <th>האתר</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const mismatch = r.lastEbayQty !== null && r.lastEbayQty !== r.available
                      return (
                        <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/sync/products/${r.id}`)}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <SelectBox r={r} checked={selected.has(r.id)} onToggle={toggle} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 240 }}>
                              <Thumb src={r.image} title={r.title} />
                              <Link href={`/sync/products/${r.id}`} className="ax-row-title" onClick={(e) => e.stopPropagation()}>
                                {r.title || '—'}
                              </Link>
                              {r.source === 'manual' && <ManualPill />}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="ax-num ax-ltr">{r.sku}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="ax-num ax-ltr">{r.ebayItemId ?? '—'}</span>
                          </td>
                          <td>
                            <span className="ax-num" style={{ fontWeight: 600 }}>
                              {num(r.available)}
                            </span>
                          </td>
                          <td>
                            <span className="ax-num" style={{ color: mismatch ? 'var(--ax-warn)' : undefined, fontWeight: mismatch ? 600 : undefined }}>
                              {r.lastEbayQty === null ? '—' : num(r.lastEbayQty)}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="ax-num">{money(r.price, r.currency)}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className={shipIsMoney(r.ship?.us) ? 'ax-num' : undefined}>{r.ship ? shipPrice(r.ship.us, r.ship.currency) : '—'}</span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className={shipIsMoney(r.ship?.intl) ? 'ax-num' : undefined}>{r.ship ? shipPrice(r.ship.intl, r.ship.currency, r.ship.globalShipping) : '—'}</span>
                          </td>
                          <td onClick={(e) => r.wooProductId && e.stopPropagation()}>{r.wooProductId ? <WooLink id={r.wooProductId} /> : <Pill t={WOO_NOT_LINKED[1]}>{WOO_NOT_LINKED[0]}</Pill>}</td>
                          <td>
                            <Pills r={r} mismatch={mismatch} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ax-only-mobile ax-mcards">
              {rows.map((r) => {
                const mismatch = r.lastEbayQty !== null && r.lastEbayQty !== r.available
                return (
                  <div key={r.id} className="ax-mcard">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <SelectBox r={r} checked={selected.has(r.id)} onToggle={toggle} />
                      <Thumb src={r.image} title={r.title} />
                      <Link href={`/sync/products/${r.id}`} className="ax-row-title" style={{ minWidth: 0 }}>
                        {r.title || '—'}
                      </Link>
                      {r.source === 'manual' && <ManualPill />}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 13 }}>
                      <span>
                        <bdi className="ax-muted">SKU</bdi> 
                        <span className="ax-num ax-ltr">{r.sku}</span>
                      </span>
                      <span>
                        <bdi className="ax-muted">מלאי</bdi> 
                        <span className="ax-num" style={{ fontWeight: 600 }}>
                          {num(r.available)}
                        </span>
                      </span>
                      <span>
                        <bdi className="ax-muted">ב-eBay</bdi> 
                        <span className="ax-num" style={{ color: mismatch ? 'var(--ax-warn)' : undefined }}>
                          {r.lastEbayQty === null ? '—' : num(r.lastEbayQty)}
                        </span>
                      </span>
                      <span className="ax-num">{money(r.price, r.currency)}</span>
                      {r.ship && (
                        <span>
                          <bdi className="ax-muted">משלוח ארה״ב</bdi> <span className={shipIsMoney(r.ship.us) ? 'ax-num' : undefined}>{shipPrice(r.ship.us, r.ship.currency)}</span>
                        </span>
                      )}
                      {r.ship && (
                        <span>
                          <bdi className="ax-muted">לעולם</bdi> <span className={shipIsMoney(r.ship.intl) ? 'ax-num' : undefined}>{shipPrice(r.ship.intl, r.ship.currency, r.ship.globalShipping)}</span>
                        </span>
                      )}
                      {r.wooProductId && (
                        <span>
                          <bdi className="ax-muted">בחנות</bdi> <WooLink id={r.wooProductId} />
                        </span>
                      )}
                    </div>
                    <Pills r={r} mismatch={mismatch} />
                  </div>
                )
              })}
            </div>
          </section>
          {shippingOpen && <ShippingToStoreDialog onClose={() => setShippingOpen(false)} />}
          {sending && <SendToStoreDialog productIds={Array.from(selected)} onClose={() => setSending(false)} onDone={() => setSelected(new Set())} />}
          {nextOffset !== null && data && (
            <button type="button" className="ax-btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Spin />}
              טעינת עוד מוצרים ({num(data.total - rows.length)} נותרו)
            </button>
          )}
        </>
      )}
    </>
  )
}

/** תיבת בחירה לשליחה לחנות. מוצר שכבר בחנות לא נבחר. */
function SelectBox({ r, checked, onToggle }: { r: ProductRow; checked: boolean; onToggle: (id: string) => void }) {
  return (
    <label className="ax-check" style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
      <input type="checkbox" checked={checked} disabled={!!r.wooProductId || r.source === 'manual'} onChange={() => onToggle(r.id)} />
      <span className="ax-sr">{r.wooProductId ? `${r.title} — כבר בחנות` : r.source === 'manual' ? `${r.title} — מוצר ידני, נשלח מדף המוצר` : `בחירת ${r.title}`}</span>
    </label>
  )
}

/** מוצר שנוצר ידנית במערכת — לא קשור ל-eBay */
function ManualPill() {
  return (
    <span style={{ flexShrink: 0 }}>
      <Pill t="violet">ידני</Pill>
    </span>
  )
}

function Thumb({ src, title }: { src: string | null; title: string | null }) {
  return src ? (
    <ZoomThumb images={[src]} title={title ?? undefined} size={40} alt={`התמונה של ${title || 'המוצר'}`} />
  ) : (
    <span className="ax-tile" aria-hidden="true">
      <ImageOff size={18} />
    </span>
  )
}

function Pills({ r, mismatch }: { r: ProductRow; mismatch: boolean }) {
  const [stockLabel, stockTone] = stockStatus(r.available)
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Pill t={stockTone} dot>
        {stockLabel}
      </Pill>
      {mismatch && <Pill t={MISMATCH[1]}>{MISMATCH[0]}</Pill>}
      {!r.syncEnabled && <Pill t={SYNC_OFF[1]}>{SYNC_OFF[0]}</Pill>}
      {!r.hasDetails && !r.wooProductId && r.source !== 'manual' && <Pill t="gray">בלי פרטים מלאים</Pill>}
    </div>
  )
}
