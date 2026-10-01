import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { CATEGORY_TREE } from '@/lib/woo/categorize'
import { suggestSku } from '@/lib/products/manual-shared'

// GET — מה שהטופס צריך: עץ הקטגוריות של החנות, תגיות שכבר בשימוש, SKU מוצע. (מותגים — חיפוש ב-./brands)

export const dynamic = 'force-dynamic'

export async function GET() {
  const { products, channelMappings } = schema
  const tags = await db.execute<{ tag: string }>(sql`select distinct jsonb_array_elements_text(${products.tags}) as tag from ${products} where ${products.tags} is not null order by 1 limit 300`)
  // SKU מוצע שלא קיים (התנגשות כמעט בלתי אפשרית, אבל בודקים)
  let sku = suggestSku()
  for (let i = 0; i < 5 && (await db.query.channelMappings.findFirst({ where: eq(channelMappings.sku, sku) })); i++) sku = suggestSku()
  return NextResponse.json({
    categories: CATEGORY_TREE.map((c) => ({ slug: c.slug, name: c.name, parent: c.parent ?? null })),
    tags: tags.rows.map((t) => t.tag),
    sku,
  })
}
