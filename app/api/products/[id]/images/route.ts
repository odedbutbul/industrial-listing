import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getClient()
  const { data: product, error } = await supabase
    .from('products')
    .select('title, manufacturer, model, images')
    .eq('id', params.id)
    .single()

  if (error || !product) {
    return NextResponse.json({ error: 'מוצר לא נמצא' }, { status: 404 })
  }

  const images: string[] = product.images ?? []
  if (images.length === 0) {
    return NextResponse.json({ error: 'אין תמונות למוצר זה' }, { status: 404 })
  }

  const zip = new JSZip()

  await Promise.all(
    images.map(async (url, i) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) return
        const buffer = await res.arrayBuffer()
        const ext = url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] ?? 'jpg'
        zip.file(`image-${String(i + 1).padStart(2, '0')}.${ext}`, buffer)
      } catch {
        // skip images that fail to fetch
      }
    })
  )

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })

  const name = (product.title || `${product.manufacturer} ${product.model}`).trim()
  const safeName = name.replace(/[^a-zA-Z0-9א-ת\s-]/g, '').trim() || 'product'
  const fileName = `${safeName}-images.zip`

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
