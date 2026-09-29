import { NextRequest, NextResponse } from 'next/server'
import { OAUTH_STATE_COOKIE, exchangeCodeAndSave } from '@/lib/ebay/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  const baseUrl = process.env.APP_BASE_URL || request.nextUrl.origin

  const done = (query: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${query}`, baseUrl))
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/api/ebay/oauth' })
    return res
  }
  const fail = (reason: string) => done('ebay_oauth=error&reason=' + encodeURIComponent(reason))

  if (error || !code) return fail(error || 'no authorization code')
  if (!state || !expectedState || state !== expectedState) return fail('state_mismatch')

  try {
    const { accessExpiresAt } = await exchangeCodeAndSave(code)
    console.log('[oauth/callback] tokens saved, access expires at', accessExpiresAt.toISOString())
    return done('ebay_oauth=success')
  } catch (err) {
    console.error('[oauth/callback] failed:', err)
    return fail(err instanceof Error ? err.message : String(err))
  }
}
