// בדיקה, קריאה בלבד מול החנות: האם תוכן המוצרים בחנות זהה למה שהמערכת הייתה שולחת (לפי שדה).
//
//   npm run job:store-content-audit -- --limit=50

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

async function main() {
  const { auditStoreContent } = await import('@/lib/sync/woo-content')
  const { pool } = await import('@/lib/db/client')
  try {
    console.log(JSON.stringify(await auditStoreContent(Number(arg('limit') ?? 50)), null, 1))
  } catch (err) {
    console.error('[store-content-audit] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
