import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl } from '@/lib/ebay/auth'
import { EbayConfigError } from '@/lib/ebay/config'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const state = randomBytes(24).toString('base64url')
  let authUrl: string
  try {
    authUrl = buildAuthorizeUrl(state)
  } catch (err) {
    if (err instanceof EbayConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const res = NextResponse.redirect(authUrl)
  // מגן מפני CSRF: ה-callback מאמת שה-state חזר כמו שנשלח
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/api/ebay/oauth',
  })
  return res
}
