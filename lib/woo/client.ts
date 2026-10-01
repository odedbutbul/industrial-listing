import { getWooConfig } from './config'

// לקוח REST API v3 של WooCommerce. אימות: Basic auth עם consumer key/secret (על HTTPS בלבד).

export class WooApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message)
  }
}

export interface WooResponse<T> {
  data: T
  /** X-WP-Total / X-WP-TotalPages ברשימות */
  total: number | null
  totalPages: number | null
}

type Query = Record<string, string | number | boolean | undefined>

const TIMEOUT_MS = 20_000

export async function wooRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { query?: Query; body?: unknown; timeoutMs?: number } = {}): Promise<WooResponse<T>> {
  const cfg = getWooConfig()
  const url = new URL(`${cfg.baseUrl}/wp-json/wc/v3/${path.replace(/^\/+/, '')}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))

  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64'),
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new WooApiError(timeout ? `החנות לא ענתה תוך ${timeoutMs / 1000} שניות` : 'אין חיבור לחנות (DNS / רשת / SSL)', 0)
  }

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // דף HTML במקום JSON: הגנת סיסמה, Cloudflare, או שה-REST API לא זמין
    throw new WooApiError(
      res.ok ? 'החנות החזירה דף HTML במקום JSON — ייתכן שהאתר מוגן בסיסמה או חסום ע"י Cloudflare' : `החנות החזירה שגיאה ${res.status} בלי JSON — ייתכן שהאתר מוגן בסיסמה, חסום, או שה-REST API כבוי`,
      res.status,
    )
  }

  if (!res.ok) {
    const err = json as { code?: string; message?: string } | null
    throw new WooApiError(explain(res.status, err?.code ?? null, err?.message ?? null), res.status, err?.code ?? null)
  }

  const num = (h: string) => {
    const v = res.headers.get(h)
    return v === null ? null : Number(v)
  }
  return { data: json as T, total: num('x-wp-total'), totalPages: num('x-wp-totalpages') }
}

export const wooGet = <T>(path: string, query?: Query) => wooRequest<T>('GET', path, { query })

/** הודעה בעברית לשגיאות הנפוצות; ההודעה המקורית נשמרת בסוגריים. */
function explain(status: number, code: string | null, message: string | null): string {
  const orig = message ? ` (${message})` : ''
  if (status === 401 || code === 'woocommerce_rest_authentication_error') return `המפתחות לא התקבלו — בדוק את WC_CONSUMER_KEY ו-WC_CONSUMER_SECRET${orig}`
  if (status === 403 || code?.startsWith('woocommerce_rest_cannot')) return `למפתח אין הרשאה לפעולה הזו — ודא שהוגדר Read/Write${orig}`
  if (status === 404 && code === 'rest_no_route') return `WooCommerce לא נמצא בכתובת — האם התוסף פעיל?${orig}`
  if (status === 404) return `הכתובת לא נמצאה — בדוק את WC_BASE_URL ואת ה-Permalinks${orig}`
  return `שגיאה ${status}${orig}`
}
