import { NextRequest, NextResponse } from 'next/server'
import { listLeads, type LeadKindFilter, type LeadStatusFilter } from '@/lib/leads/queries'

// GET /api/sync/leads?status=open|new|closed|all &kind=all|rfq|msg &q= &before=<iso>

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const status = (['open', 'new', 'closed', 'all'].includes(sp.get('status') ?? '') ? sp.get('status') : 'open') as LeadStatusFilter
  const kind = (['all', 'rfq', 'msg'].includes(sp.get('kind') ?? '') ? sp.get('kind') : 'all') as LeadKindFilter
  return NextResponse.json(await listLeads({ status, kind, q: sp.get('q') ?? undefined, before: sp.get('before') ?? undefined }))
}
