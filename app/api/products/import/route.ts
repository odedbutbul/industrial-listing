import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface ImportRow {
  ebay_item_number: string
  title: string
  sku: string
  price: number | undefined
  quantity: number | undefined
  ebay_category: string
  condition: string
  manufacturer: string
  model: string
}

export async function POST(request: NextRequest) {
  const supabase = getClient()
  const { products }: { products: ImportRow[] } = await request.json()

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: 'אין מוצרים לייבא' }, { status: 400 })
  }

  let imported = 0
  let updated = 0
  let errors = 0

  for (const p of products) {
    try {
      if (p.ebay_item_number) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('ebay_item_number', p.ebay_item_number)
          .maybeSingle()

        if (existing) {
          const { error } = await supabase.from('products').update({
            title: p.title || null,
            sku: p.sku || null,
            price: p.price ?? null,
            quantity: p.quantity ?? null,
            ebay_category: p.ebay_category || null,
            condition: p.condition || 'Used',
          }).eq('id', existing.id)
          if (error) errors++
          else updated++
          continue
        }
      }

      const { error } = await supabase.from('products').insert({
        id: crypto.randomUUID(),
        manufacturer: p.manufacturer || 'Unknown',
        model: p.model || 'Unknown',
        title: p.title || null,
        sku: p.sku || null,
        price: p.price ?? null,
        quantity: p.quantity ?? 1,
        ebay_category: p.ebay_category || null,
        condition: p.condition || 'Used',
        ebay_item_number: p.ebay_item_number || null,
        ebay_listing_id: p.ebay_item_number || null,
        status_ebay: p.ebay_item_number ? 'active' : 'pending',
        status_facebook: 'pending',
        status: 'active',
        images: [],
      })

      if (error) errors++
      else imported++
    } catch {
      errors++
    }
  }

  return NextResponse.json({ imported, updated, errors })
}
