'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { api, openImport } from '@/components/sync/api'
import { MISMATCH, money, num, stockStatus, SYNC_OFF, WOO_NOT_LINKED } from '@/components/sync/format'
import { useDataChanged } from '@/components/sync/hooks'
import type { ProductRow } from '@/components/sync/types'
import { Badge, EmptyState, LoadError, Pills, useLoad } from '@/components/sync/ui'

type Page = { products: ProductRow[]; total: number; inStock: number; nextOffset: number | null }
type Filter = 'all' | 'in_stock' | 'sold_out' | 'mismatch' | 'no_woo'
const FILTERS: [Filter, string][] = [
  ['all', 'הכל'],
  ['in_stock', 'במלאי'],
  ['sold_out', 'אזלו'],
  ['mismatch', 'פערים מול eBay'],
  ['no_woo', 'לא מקושרים לאתר'],
]

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="skeleton" />}>
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

  return (
    <section className="section">
      <div>
        <h1 className="h1">מוצרים</h1>
        <p className="sub">{!data ? ' ' : filtered ? `${num(data.total)} תוצאות` : `${num(data.total)} מוצרים · ${num(data.inStock)} במלאי`}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Pills label="סינון מוצרים" options={FILTERS} value={filter} onChange={(f) => setParams({ filter: f })} />
        <div className="search" style={{ minWidth: 220 }}>
          <i className="ph ph-magnifying-glass" />
          <input type="search" aria-label="חיפוש מוצר" placeholder="כותרת, SKU, מספר מודעה או MPN" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error ? (
        <LoadError error={error} retry={reload} />
      ) : !rows ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : rows.length === 0 && !filtered ? (
        <EmptyState
          icon="ph ph-package"
          title="עדיין אין מוצרים"
          text="מייבאים את המודעות הפעילות מ-eBay — קודם תצוגה מקדימה, ושום דבר לא משתנה ב-eBay."
          action={
            <button type="button" className="btn primary lg" onClick={openImport}>
              <i className="ph-bold ph-download-simple" />
              ייבוא מ-eBay
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>אין מוצרים שמתאימים לסינון.</span>
            <button type="button" className="link-btn" onClick={() => (setQuery(''), setParams({ filter: 'all', q: '' }))}>
              ניקוי הסינון
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card scroll-x">
            <table className="table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th>מוצר</th>
                  <th>SKU</th>
                  <th style={{ whiteSpace: 'nowrap' }}>מודעת eBay</th>
                  <th>מלאי</th>
                  <th style={{ whiteSpace: 'nowrap' }}>ב-eBay</th>
                  <th>מחיר</th>
                  <th>האתר</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [stockLabel, stockTone] = stockStatus(r.available)
                  const mismatch = r.lastEbayQty !== null && r.lastEbayQty !== r.available
                  return (
                    <tr key={r.id} className="hover" style={{ cursor: 'pointer' }} onClick={() => router.push(`/sync/products/${r.id}`)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 240 }}>
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.image}
                              alt=""
                              width={40}
                              height={40}
                              loading="lazy"
                              style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0, boxShadow: 'var(--ring)' }}
                            />
                          ) : (
                            <span className="tile" aria-hidden="true">
                              <i className="ph ph-image" />
                            </span>
                          )}
                          <Link href={`/sync/products/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>
                            {r.title || '—'}
                          </Link>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="mono ltr">{r.sku}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="mono ltr">{r.ebayItemId ?? '—'}</span>
                      </td>
                      <td>
                        <span className="mono" style={{ fontWeight: 600 }}>
                          {num(r.available)}
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{ color: mismatch ? 'var(--warn)' : undefined, fontWeight: mismatch ? 600 : undefined }}>
                          {r.lastEbayQty === null ? '—' : num(r.lastEbayQty)}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="mono">{money(r.price, r.currency)}</span>
                      </td>
                      <td>{r.wooProductId ? <span className="mono ltr">#{r.wooProductId}</span> : <Badge t={WOO_NOT_LINKED[1]}>{WOO_NOT_LINKED[0]}</Badge>}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Badge t={stockTone} dot>
                            {stockLabel}
                          </Badge>
                          {mismatch && <Badge t={MISMATCH[1]}>{MISMATCH[0]}</Badge>}
                          {!r.syncEnabled && <Badge t={SYNC_OFF[1]}>{SYNC_OFF[0]}</Badge>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {nextOffset !== null && data && (
            <button type="button" className="btn" style={{ alignSelf: 'center' }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <i className="ph ph-circle-notch spin" />}
              טעינת עוד מוצרים ({num(data.total - rows.length)} נותרו)
            </button>
          )}
        </>
      )}
    </section>
  )
}
