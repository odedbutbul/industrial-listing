import { inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { writeSyncLog } from '@/lib/sync/log'

// רשימת החסומים ב-eBay — מיובאת או מסומנת ידנית (eBay לא חושף אותה ב-API). רישום בלבד, לא נשלח ל-eBay.
// ב-sync_log רק ספירות — בלי שמות משתמש.

const b = schema.ebayBlockedBuyers
export const BLOCKED_JOB = 'customers'
const MAX_IMPORT = 5000

/** שם משתמש eBay תקין: 2–64 תווים, אותיות / ספרות / . _ - * (לפי כללי eBay, בערך) */
const USERNAME = /^[a-z0-9._*-]{2,64}$/

/** פירוק טקסט שהודבק: שורות, פסיקים, נקודה-פסיק, טאבים. מתעלם מכותרות ושורות ריקות */
export function parseUsernames(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>()
  const invalid: string[] = []
  for (const raw of text.split(/[\n,;\t]+/)) {
    const line = raw.trim()
    if (!line) continue
    // בהעתקה מ-eBay מגיע לפעמים "user (123)" — הציון בסוגריים נזרק. שם משתמש לא מכיל רווחים, אז כל שאר מה שיש בו רווח לא תקין
    const [word, ...rest] = line.split(/\s+/)
    if (rest.length && !/^\(\s*[\d,]+\s*[^)]*\)$/.test(rest.join(' '))) {
      invalid.push(line)
      continue
    }
    const v = word.toLowerCase().replace(/^@/, '')
    if (USERNAME.test(v)) seen.add(v)
    else invalid.push(line)
  }
  return { valid: Array.from(seen), invalid }
}

export async function importBlocked(text: string, note?: string) {
  const { valid, invalid } = parseUsernames(text)
  if (!valid.length) return { added: 0, already: 0, matched: 0, unmatched: [] as string[], invalid }
  const list = valid.slice(0, MAX_IMPORT)
  const existing = await db.select({ u: b.username }).from(b).where(inArray(b.username, list))
  const have = new Set(existing.map((r) => r.u))
  const fresh = list.filter((u) => !have.has(u))
  if (fresh.length) await db.insert(b).values(fresh.map((u) => ({ username: u, note: note?.trim().slice(0, 300) || null, source: 'import' }))).onConflictDoNothing()
  const found = (await db.execute(sql`select lower(ebay_username) u from customers where lower(ebay_username) in (${sql.join(list.map((u) => sql`${u}`), sql`, `)})`)).rows as { u: string }[]
  const matchedSet = new Set(found.map((r) => r.u))
  await writeSyncLog({ job: BLOCKED_JOB, action: 'blocked_import', success: true, details: { added: fresh.length, already: have.size, matched: matchedSet.size, invalid: invalid.length } })
  return { added: fresh.length, already: have.size, matched: matchedSet.size, unmatched: list.filter((u) => !matchedSet.has(u)), invalid }
}

export async function setBlocked(username: string, blocked: boolean, note?: string) {
  const u = username.trim().toLowerCase()
  if (blocked) {
    await db
      .insert(b)
      .values({ username: u, note: note?.trim().slice(0, 300) || null, source: 'manual' })
      .onConflictDoUpdate({ target: b.username, set: { note: note?.trim().slice(0, 300) || null } })
  } else {
    await db.delete(b).where(sql`${b.username} = ${u}`)
  }
}

export async function blockedCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(b)
  return r?.n ?? 0
}
