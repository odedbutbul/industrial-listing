import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// eBay calls GET to verify the endpoint ownership
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const challengeCode = searchParams.get('challenge_code')
  if (!challengeCode) {
    return NextResponse.json({ error: 'missing challenge_code' }, { status: 400 })
  }
  return NextResponse.json({ challengeResponse: challengeCode })
}

// eBay calls POST when an item is sold or status changes
export async function POST(request: NextRequest) {
  let xml: string
  try {
    xml = await request.text()
  } catch {
    return NextResponse.json({ ok: false, error: 'failed to read body' }, { status: 400 })
  }

  // Extract ItemID with a simple regex — handles various eBay notification envelope formats
  const itemIdMatch = xml.match(/<ItemID>(\d+)<\/ItemID>/)
  const itemId = itemIdMatch?.[1]

  console.log('[ebay-notifications] received notification, itemId:', itemId, 'xml snippet:', xml.slice(0, 300))

  if (itemId) {
    const supabase = getClient()
    const { error } = await supabase
      .from('products')
      .update({ status: 'sold', status_ebay: 'sold', sold_at: new Date().toISOString() })
      .eq('ebay_item_number', itemId)

    if (error) {
      console.error('[ebay-notifications] supabase update error:', error)
    } else {
      console.log('[ebay-notifications] marked sold for itemId:', itemId)
    }
  }

  // eBay expects a 200 response — always return OK
  return NextResponse.json({ ok: true })
}
