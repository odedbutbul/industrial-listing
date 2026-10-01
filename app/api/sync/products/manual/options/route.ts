import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { CATEGORY_TREE } from '@/lib/woo/categorize'
import { suggestSku } from '@/lib/products/manual-shared'

// GET — מה שהטופס צריך: עץ הקטגוריות של החנות, מותגים קיימים במערכת, תגיות שכבר בשימוש, SKU מוצע.

export const dynamic = 'force-dynamic'

export async function GET() {
  const { products, channelMappings } = schema
  const brands = await db
    .select({ brand: products.brand, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(isNotNull(products.brand), eq(products.archived, false)))
    .groupBy(products.brand)
    .orderBy(sql`count(*) desc`)
    .limit(400)
  const tags = await db.execute<{ tag: string }>(sql`select distinct jsonb_array_elements_text(${products.tags}) as tag from ${products} where ${products.tags} is not null order by 1 limit 300`)
  // SKU מוצע שלא קיים (התנגשות כמעט בלתי אפשרית, אבל בודקים)
  let sku = suggestSku()
  for (let i = 0; i < 5 && (await db.query.channelMappings.findFirst({ where: eq(channelMappings.sku, sku) })); i++) sku = suggestSku()
  return NextResponse.json({
    categories: CATEGORY_TREE.map((c) => ({ slug: c.slug, name: c.name, parent: c.parent ?? null })),
    brands: brands.map((b) => b.brand!).filter(Boolean),
    tags: tags.rows.map((t) => t.tag),
    sku,
  })
}
