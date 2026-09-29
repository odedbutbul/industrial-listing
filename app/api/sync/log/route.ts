import { NextRequest, NextResponse } from 'next/server'
import { listLog, type LogStatus } from '@/lib/sync/queries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const status = sp.get('status') as LogStatus | null
  const before = Number(sp.get('before'))
  return NextResponse.json(
    await listLog({
      status: status === 'ok' || status === 'fail' ? status : 'all',
      job: sp.get('job') || undefined,
      before: Number.isFinite(before) && before > 0 ? before : undefined,
    }),
  )
}
