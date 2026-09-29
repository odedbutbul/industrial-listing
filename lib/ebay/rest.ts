import { getValidAccessToken } from './auth'
import { getEbayConfig } from './config'
import { assertEbayRestAllowed } from './guard'
import { EbayApiError } from './trading'

// לקוח ל-Sell REST APIs של eBay. קריאה בלבד — GET. כל קריאה עוברת את assertEbayRestAllowed.

export async function ebayGet<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  assertEbayRestAllowed('GET', path)
  const config = getEbayConfig()
  const token = await getValidAccessToken()
  const url = new URL(path, config.apiBase)
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v))

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const first = data?.errors?.[0]
    throw new EbayApiError(first?.longMessage ?? first?.message ?? `eBay HTTP ${res.status}`, `GET ${path}`, data?.errors ?? [])
  }
  return data as T
}
