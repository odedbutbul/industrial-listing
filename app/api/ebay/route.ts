import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    message: 'ממתין לפרטי eBay API',
    status: 'placeholder',
  }, { status: 200 })
}
