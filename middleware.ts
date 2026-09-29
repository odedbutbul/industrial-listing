import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/ebay/oauth/callback']

function getSessionSecret(request: NextRequest): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  return `auth-${process.env.ADMIN_USERNAME}-${process.env.ADMIN_PASSWORD}`
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth-token')?.value
  const secret = getSessionSecret(request)

  if (!token || token !== secret) {
    // מאחורי nginx/Cloudflare ה-request.url הוא הכתובת הפנימית (localhost:PORT) — לכן הבסיס הוא
    // APP_BASE_URL (הכתובת הציבורית). Next.js לא מקבל Location יחסי ב-middleware.
    const loginUrl = new URL('/login', process.env.APP_BASE_URL || request.url)
    loginUrl.searchParams.set('from', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
