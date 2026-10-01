import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db, schema } from '@/lib/db/client'
import { deleteMedia } from '@/lib/products/media'

// DELETE — תמונה שהוסרה בטופס לפני שהמוצר נשמר: נמחקת מיד מספריית המדיה של החנות.
// תמונה של מוצר שמור נמחקת רק בשמירה / בעדכון בחנות (כדי שביטול הטופס לא יאבד אותה).

export const dynamic = 'force-dynamic'

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  const { mediaFiles } = schema
  const [row] = await db.select({ id: mediaFiles.id, wooMediaId: mediaFiles.wooMediaId }).from(mediaFiles).where(and(eq(mediaFiles.id, params.id), isNull(mediaFiles.productId)))
  if (!row) return NextResponse.json({ ok: true, kept: true })
  const n = await deleteMedia([row], 'removed_before_save')
  return n ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'המחיקה מספריית המדיה נכשלה — תימחק בניקוי האוטומטי' }, { status: 502 })
}
