import { NextRequest, NextResponse } from 'next/server'

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  // fallback: נגזר מהפרטים אם SESSION_SECRET לא מוגדר
  return `auth-${process.env.ADMIN_USERNAME}-${process.env.ADMIN_PASSWORD}`
}

export async function POST(request: NextRequest) {
  const { username, password } = await request.json()

  const adminUsername = process.env.ADMIN_USERNAME
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminUsername || !adminPassword) {
    return NextResponse.json({ error: 'הגדרות אימות חסרות בשרת' }, { status: 500 })
  }

  if (username !== adminUsername || password !== adminPassword) {
    return NextResponse.json({ error: 'שם משתמש או סיסמה שגויים' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('auth-token', getSessionSecret(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return response
}
