'use client'

import Link from 'next/link'
import { ScanSearch } from 'lucide-react'
import { api } from './api'
import { CHECK_LABEL } from './quality'
import { useLoad } from './ui'

interface Row {
  id: string
  check: keyof typeof CHECK_LABEL
  severity: 'high' | 'medium' | 'low'
  message: string
}

/** הערה בדף המוצר כשבדיקת המודעות מצאה בו משהו שלא תואם. בלי ממצאים — לא מוצג כלום. */
export function QualityAlert({ productId }: { productId: string }) {
  const { data } = useLoad(() => api.get<{ rows: Row[] }>(`/api/sync/quality?product=${productId}`), [productId])
  const rows = data?.rows ?? []
  if (!rows.length) return null
  const high = rows.some((r) => r.severity === 'high')
  return (
    <div className={'ax-alert ' + (high ? 'is-bad' : 'is-warn')} role="status">
      <ScanSearch size={18} aria-hidden="true" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <b>בדיקת המודעות מצאה כאן משהו שלא תואם</b>
        {rows.map((r) => (
          <span key={r.id}>
            {CHECK_LABEL[r.check] ?? r.check}: {r.message}
          </span>
        ))}
        <Link href={`/sync/quality${rows.length === 1 ? `?filter=${rows[0].check}` : ''}`}>לכל הממצאים</Link>
      </div>
    </div>
  )
}
