import { wooBaseUrl } from '@/lib/woo/config'
import { LeadsConfigError, signedHeaders } from './signature'

// בקשות חתומות של המערכת לאתר (REST של ה-theme: /wp-json/vz/v1/leads/...).
// כתובת האתר = WC_BASE_URL (אותה חנות). החתימה על "GET <route>" — route בלי /wp-json.

export function wpLeadsUrl(route: string): string {
  const base = wooBaseUrl()
  if (!base) throw new LeadsConfigError('חסר משתנה סביבה: WC_BASE_URL')
  return `${base}/wp-json${route}`
}

export async function wpLeadsGet(route: string, init: { timeoutMs?: number } = {}): Promise<Response> {
  const headers = signedHeaders(`GET ${route}`)
  // מחרוזת שאילתה ייחודית — שכבת קאש בדרך (xSpeed / Cloudflare) לא תחזיר תשובה ישנה. לא נכנסת לחתימה.
  return fetch(`${wpLeadsUrl(route)}?_=${headers['X-VZ-Timestamp']}${Math.random().toString(36).slice(2, 8)}`, {
    headers: { ...headers, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  })
}
