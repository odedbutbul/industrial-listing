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

  // Read WEBHOOK_URL from settings table, fall back to env var
  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value ?? '']))
  const webhookUrl = settings.WEBHOOK_URL || process.env.WEBHOOK_URL || ''

  console.log('[webhook] WEBHOOK_URL from settings:', settings.WEBHOOK_URL ? '✓ found' : 'missing')
  console.log('[webhook] WEBHOOK_URL from env:', process.env.WEBHOOK_URL ? '✓ found' : 'missing')
  console.log('[webhook] using URL:', webhookUrl ? webhookUrl.slice(0, 40) + '...' : 'NONE')

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
  const images: string[] = Array.isArray(product.images) ? product.images : []
  const image_main: string | null = images[0] ?? null

  console.log('[webhook] product.images raw:', product.images)
  console.log('[webhook] images array:', images)
  console.log('[webhook] image_main:', image_main)

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
    images,
    image_main,
    timestamp: new Date().toISOString(),
  }

  console.log('[webhook] sending payload keys:', Object.keys(payload))
  console.log('[webhook] payload.images:', payload.images)
  console.log('[webhook] payload.image_main:', payload.image_main)

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
