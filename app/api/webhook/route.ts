import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  const supabase = getServiceClient()
  const { product_id } = await request.json()

  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'WEBHOOK_URL לא מוגדר בהגדרות' }, { status: 400 })
  }

  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .eq('id', product_id)
    .single()

  if (fetchError || !product) {
    return NextResponse.json({ error: 'מוצר לא נמצא' }, { status: 404 })
  }

  const postText = buildPostText(product)

  const payload = {
    product_id: product.id,
    manufacturer: product.manufacturer,
    model: product.model,
    category: product.category,
    year: product.year,
    condition: product.condition,
    price: product.price,
    description: product.description,
    location: product.location,
    phone: product.phone,
    post_text: postText,
    images: product.images,
    timestamp: new Date().toISOString(),
  }

  let responseStatus = 0
  let success = false

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    responseStatus = response.status
    success = response.ok
  } catch {
    success = false
  }

  await supabase.from('webhook_logs').insert({
    product_id,
    webhook_url: webhookUrl,
    payload,
    response_status: responseStatus,
    success,
  })

  if (success) {
    await supabase
      .from('products')
      .update({ status_facebook: 'published', facebook_published_at: new Date().toISOString() })
      .eq('id', product_id)
  }

  return NextResponse.json({ success, response_status: responseStatus })
}

function buildPostText(product: Record<string, unknown>): string {
  return `🔧 ${product.manufacturer} ${product.model} | ${product.category || ''}

📌 מצב: ${product.condition}
📅 שנת ייצור: ${product.year || 'לא צוין'}
📍 מיקום: ${product.location || 'לא צוין'}
💰 מחיר: ₪${product.price || 'לא צוין'}

📋 פרטים נוספים:
${product.description || ''}

─────────────────
י.פ. פתרונות טכניים
📞 ${product.phone || '054-2333651'}
✉️ info@yp-ts.com`
}
