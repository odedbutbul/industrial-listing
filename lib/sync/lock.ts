import { pool } from '@/lib/db/client'

export class JobLockedError extends Error {
  constructor(readonly job: string) {
    super(`ה-job "${job}" כבר רץ`)
  }
}

/**
 * מריץ fn רק אם אין ריצה אחרת של אותו job (pg advisory lock ברמת session).
 * אם נעול — זורק JobLockedError ולא מחכה.
 */
export async function withJobLock<T>(job: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as locked',
      [`job:${job}`],
    )
    if (!rows[0]?.locked) throw new JobLockedError(job)
    try {
      return await fn()
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [`job:${job}`])
    }
  } finally {
    client.release()
  }
}
