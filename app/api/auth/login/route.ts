import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { username, password } = await request.json()

  const adminUsername = process.env.ADMIN_USERNAME
  const adminPassword = process.env.ADMIN_PASSWORD
  const sessionSecret = process.env.SESSION_SECRET

  if (!adminUsername || !adminPassword || !sessionSecret) {
    return NextResponse.json({ error: 'הגדרות אימות חסרות בשרת' }, { status: 500 })
  }

  if (username !== adminUsername || password !== adminPassword) {
    return NextResponse.json({ error: 'שם משתמש או סיסמה שגויים' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('auth-token', sessionSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 יום
    path: '/',
  })
  return response
}
