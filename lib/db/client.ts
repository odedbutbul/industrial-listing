import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// צד שרת בלבד. Pool יחיד לתהליך — שורד hot reload בפיתוח.
const globalForDb = globalThis as unknown as { pgPool?: Pool }

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL חסר')
  return new Pool({ connectionString, max: 10 })
}

export const pool = globalForDb.pgPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool

export const db = drizzle(pool, { schema })
export type Db = typeof db
export { schema }
