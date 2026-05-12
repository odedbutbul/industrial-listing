import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.redirect('/')
  response.cookies.delete('auth-token')
  return response
}
