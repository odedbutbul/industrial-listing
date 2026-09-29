// הגדרות WooCommerce ממשתני סביבה בלבד. הערכים לא נחשפים — רק שמות המשתנים החסרים.

export interface WooConfig {
  baseUrl: string
  consumerKey: string
  consumerSecret: string
}

export class WooConfigError extends Error {}

const REQUIRED = ['WC_BASE_URL', 'WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET'] as const

/** אילו משתני סביבה חסרים — לתצוגת סטטוס, בלי לחשוף ערכים. */
export function missingWooEnv(): string[] {
  return REQUIRED.filter((k) => !process.env[k])
}

/** כתובת החנות המנורמלת (בלי / בסוף), או null אם לא הוגדרה. */
export function wooBaseUrl(): string | null {
  const raw = process.env.WC_BASE_URL?.trim()
  return raw ? raw.replace(/\/+$/, '') : null
}

export function getWooConfig(): WooConfig {
  const missing = missingWooEnv()
  if (missing.length) throw new WooConfigError(`חסרים משתני סביבה: ${missing.join(', ')}`)

  const baseUrl = wooBaseUrl()!
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new WooConfigError('WC_BASE_URL אינה כתובת תקינה')
  }
  // המפתחות נשלחים ב-Basic auth — רק על HTTPS. http מותר רק לשרת מדומה מקומי.
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !local) throw new WooConfigError('WC_BASE_URL חייבת להתחיל ב-https://')

  return {
    baseUrl,
    consumerKey: process.env.WC_CONSUMER_KEY!,
    consumerSecret: process.env.WC_CONSUMER_SECRET!,
  }
}
