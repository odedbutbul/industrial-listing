import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getServiceClient()
  const { searchParams } = new URL(request.url)
  const status_ebay = searchParams.get('status_ebay')
  const status_facebook = searchParams.get('status_facebook')
  const category = searchParams.get('category')
  const search = searchParams.get('search')

  let query = supabase.from('products').select('*').order('created_at', { ascending: false })

  if (status_ebay) query = query.eq('status_ebay', status_ebay)
  if (status_facebook) query = query.eq('status_facebook', status_facebook)
  if (category) query = query.eq('category', category)
  if (search) query = query.or(`title.ilike.%${search}%,manufacturer.ilike.%${search}%,model.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = getServiceClient()
  const body = await request.json()

  const { data, error } = await supabase.from('products').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE() {
  const supabase = getServiceClient()
  const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
