import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { MAX_IMAGE_BYTES, mediaUrl } from '@/lib/products/manual-shared'

// POST /api/sync/media — העלאת תמונה למוצר ידני (multipart: file, width?, height?).
// הדפדפן כבר מקטין ודוחס (עד 2400px). כאן: בדיקת סוג לפי תוכן הקובץ, לא לפי השם.

export const dynamic = 'force-dynamic'

function sniff(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

/** שם קובץ קריא לספריית המדיה של החנות: אותיות באנגלית, ספרות ומקפים */
function fileSlug(name: string): string {
  const s = name.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return s || 'product-image'
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'לא התקבל קובץ' }, { status: 400 })
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (עד 8MB)' }, { status: 413 })
  const data = Buffer.from(await file.arrayBuffer())
  const type = sniff(data)
  if (!type) return NextResponse.json({ error: 'אפשר להעלות רק JPG, PNG או WebP' }, { status: 415 })
  const dim = (k: string) => {
    const n = Number(form?.get(k))
    return Number.isInteger(n) && n > 0 && n < 20000 ? n : null
  }
  const fileName = `${fileSlug(String(form?.get('name') ?? file.name))}.${type.ext}`
  const [row] = await db
    .insert(schema.mediaFiles)
    .values({ fileName, mime: type.mime, size: data.length, width: dim('width'), height: dim('height'), data })
    .returning({ id: schema.mediaFiles.id })
  return NextResponse.json({ id: row.id, fileName, url: mediaUrl(row.id, fileName), size: data.length, width: dim('width'), height: dim('height') }, { status: 201 })
}
