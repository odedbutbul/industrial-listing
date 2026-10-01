import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'

// GET /api/public/media/<id>/<name> — ציבורי (בלי cookie): תמונות של מוצרים ידניים.
// WooCommerce מוריד מכאן את התמונה לספריית המדיה שלו כשהמוצר נשלח לחנות. התוכן לא משתנה → מטמון ארוך.

export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: { id: string; name: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const f = await db.query.mediaFiles.findFirst({ where: eq(schema.mediaFiles.id, params.id) })
  if (!f) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      'Content-Type': f.mime,
      'Content-Length': String(f.size),
      'Content-Disposition': `inline; filename="${f.fileName}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
