import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Product = {
  id: string
  created_at: string
  updated_at: string
  title: string | null
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
  // eBay-specific fields
  sku: string | null
  ebay_category: string | null
  brand: string | null
  mpn: string | null
  country_of_origin: string | null
  quantity: number | null
  shipping_domestic: { method: string; price: number } | null
  shipping_international: { method: string; price: number } | null
  ebay_item_number: string | null
  status_ebay: 'pending' | 'active' | 'ended' | 'sold' | 'unsold' | 'failed'
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
