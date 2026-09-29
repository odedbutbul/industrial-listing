import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { writeSyncLog } from '@/lib/sync/log'
import { anonUsername } from './upsert'

// פעולות על לקוח ממסך הלקוח. כל פעולה נרשמת ב-sync_log — בלי פרטים אישיים, רק מזהה הלקוח.

export const CUSTOMERS_JOB = 'customers'
const c = schema.customers

export type CustomerAction = { action: 'consent'; note: string } | { action: 'unsubscribe' } | { action: 'anonymize' }

export async function applyCustomerAction(id: string, a: CustomerAction): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await db.query.customers.findFirst({ where: eq(c.id, id) })
  if (!row) return { ok: false, error: 'הלקוח לא נמצא', status: 404 }
  if (row.anonymizedAt) return { ok: false, error: 'הפרטים של הלקוח נמחקו — אין פעולות', status: 409 }

  if (a.action === 'consent') {
    // הסכמה ידנית (למשל הלקוח ביקש בטלפון / במייל) — חובה לתעד איך ניתנה
    const note = a.note?.trim()
    if (!note || note.length < 5) return { ok: false, error: 'צריך לתעד איך ומתי הלקוח הסכים', status: 400 }
    if (row.unsubscribedAt) return { ok: false, error: 'הלקוח הסיר את עצמו מהדיוור — אפשר לצרף אותו מחדש רק אם הוא נרשם שוב בעצמו', status: 409 }
    await db.update(c).set({ marketingConsent: true, consentSource: 'manual', consentAt: new Date(), consentNote: note.slice(0, 300), marketingBlocked: null, updatedAt: sql`now()` }).where(eq(c.id, id))
  } else if (a.action === 'unsubscribe') {
    await db.update(c).set({ unsubscribedAt: new Date(), updatedAt: sql`now()` }).where(eq(c.id, id))
  } else if (a.action === 'anonymize') {
    // בקשת מחיקה: הפרטים האישיים נמחקים לצמיתות, ההזמנות (מלאי, הכנסות) נשארות.
    // נשארים רק email_hash ושם משתמש מגובב (לא הפיכים) — כדי שקליטה חוזרת של אותן הזמנות לא תשחזר את הפרטים.
    await db
      .update(c)
      .set({ name: null, emailEnc: null, phoneEnc: null, city: null, region: null, ebayUsername: row.ebayUsername && !row.ebayUsername.startsWith('anon:') ? anonUsername(row.ebayUsername) : row.ebayUsername, marketingConsent: false, consentNote: null, anonymizedAt: new Date(), updatedAt: sql`now()` })
      .where(eq(c.id, id))
  } else {
    return { ok: false, error: 'פעולה לא מוכרת', status: 400 }
  }
  await writeSyncLog({ job: CUSTOMERS_JOB, action: a.action, success: true, details: { customerId: id } })
  return { ok: true }
}
