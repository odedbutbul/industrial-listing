import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Product = {
  id: string
  created_at: string
  updated_at: string
  manufacturer: string
  model: string
  category: string | null
  year: number | null
  condition: string
  price: number | null
  description: string | null
  location: string | null
  phone: string | null
  images: string[]
  status_ebay: 'pending' | 'published' | 'failed' | 'sold'
  ebay_listing_id: string | null
  ebay_url: string | null
  ebay_published_at: string | null
  status_facebook: 'pending' | 'published' | 'copied'
  facebook_published_at: string | null
  status: 'active' | 'sold' | 'archived'
  sold_at: string | null
  notes: string | null
}

export type WebhookLog = {
  id: string
  created_at: string
  product_id: string
  webhook_url: string
  payload: Record<string, unknown>
  response_status: number
  success: boolean
}
