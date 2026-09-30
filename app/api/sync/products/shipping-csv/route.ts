import { NextResponse } from 'next/server'
import type { ShippingOption } from '@/lib/ebay/trading'
import { listShippingCosts } from '@/lib/sync/queries'

export const dynamic = 'force-dynamic'

// קובץ CSV: מחיר משלוח לארה"ב ולשאר העולם לכל מוצר. קורא רק מ-Postgres.

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** סכום / 0 לחינם / "calculated" כשאין מחיר קבוע / ריק כשאין שירות */
const price = (o: ShippingOption | null | undefined) => (!o ? '' : o.free ? '0' : o.cost ?? 'calculated')

export async function GET() {
  const rows = await listShippingCosts()
  const header = ['SKU', 'eBay Item ID', 'Title', 'Price', 'Currency', 'Shipping type', 'US service', 'US cost', 'US each additional', 'International service', 'International cost', 'International each additional', 'International ships to', 'eBay International Shipping', 'Shipping policy', 'Fetched at']
  const lines = rows.map((r) => {
    const c = r.shippingCosts
    return [
      r.sku,
      r.ebayItemId,
      r.title,
      r.price,
      c?.currency ?? r.currency,
      c?.type,
      c?.us?.service,
      price(c?.us),
      c?.us?.additionalCost,
      c?.intl?.service,
      price(c?.intl),
      c?.intl?.additionalCost,
      c?.intl?.shipTo.join(' '),
      c ? (c.globalShipping ? 'yes' : 'no') : '',
      c?.policyName,
      r.fetchedAt?.toISOString(),
    ]
      .map(cell)
      .join(',')
  })
  // BOM כדי שאקסל יפתח UTF-8 נכון
  const body = '﻿' + [header.join(','), ...lines].join('\r\n')
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shipping-costs-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
