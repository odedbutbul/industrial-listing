import { and, eq, ilike, isNotNull, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { brandKey } from '@/lib/woo/products'

// GET ?q= — חיפוש מותגים קיימים בקטלוג (לבורר המותג בטופס). כתיב אחד לכל מותג: הנפוץ,
// ועדיפות לכתיב שאינו כולו אותיות גדולות (Lumenis ולא LUMENIS) — כמו בשליחה לחנות.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60)
  const { products } = schema
  const rows = await db
    .select({ brand: products.brand, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(isNotNull(products.brand), eq(products.archived, false), q ? ilike(products.brand, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined))
    .groupBy(products.brand)
    .orderBy(sql`count(*) desc`)
    .limit(200)
  const best = new Map<string, { name: string; n: number }>()
  const caps = (x: string) => x === x.toUpperCase()
  for (const r of rows) {
    const name = r.brand!.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const k = brandKey(name)
    const cur = best.get(k)
    if (!cur) best.set(k, { name, n: r.n })
    else best.set(k, { name: (caps(cur.name) && !caps(name)) || (caps(cur.name) === caps(name) && r.n > cur.n) ? name : cur.name, n: cur.n + r.n })
  }
  const list = Array.from(best.values())
  // התאמה מתחילת השם קודם, אחר כך לפי כמות מוצרים
  const lq = q.toLowerCase()
  list.sort((a, b) => Number(b.name.toLowerCase().startsWith(lq)) - Number(a.name.toLowerCase().startsWith(lq)) || b.n - a.n)
  return NextResponse.json({ brands: list.slice(0, 30).map((b) => ({ name: b.name, count: b.n })) })
}
