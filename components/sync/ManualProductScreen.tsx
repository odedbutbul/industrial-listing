'use client'

import { api } from './api'
import { ManualProductForm, type ManualProductData } from './ManualProductForm'
import { ProductHistory } from './ProductHistory'
import type { ProductDetail } from './types'
import { LoadError, useLoad } from './ui'

/** דף של מוצר ידני: טופס העריכה, ומתחתיו היסטוריית המלאי והלוג. */
export function ManualProductScreen({ id, detail, onSaved }: { id: string; detail: ProductDetail; onSaved: () => Promise<void> }) {
  const { data, error, reload } = useLoad(() => api.get<ManualProductData>(`/api/sync/products/${id}/manual`), [id])
  if (error) return <LoadError error={error} retry={reload} />
  if (!data)
    return (
      <>
        <div className="ax-skel" style={{ height: 60 }} />
        <div className="ax-skel" style={{ height: 420 }} />
      </>
    )
  return (
    <>
      {/* key: אחרי שמירה הטופס נבנה מחדש מהנתונים השמורים (מלאי צפוי, סטטוס "לא נשמר") */}
      <ManualProductForm
        key={data.updatedAt + String(data.wooProductId) + String(data.lastSyncedAt)}
        productId={id}
        initial={data}
        onSaved={() => void Promise.all([reload(), onSaved()])}
      />
      <ProductHistory ledger={detail.ledger} log={detail.log} />
    </>
  )
}
