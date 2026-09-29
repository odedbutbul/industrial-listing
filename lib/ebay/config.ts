// הגדרות eBay ממשתני סביבה בלבד (לא מטבלת settings).

export type EbayEnvironment = 'sandbox' | 'production'

export interface EbayConfig {
  appId: string
  certId: string
  ruName: string
  environment: EbayEnvironment
  sandbox: boolean
  authBase: string
  apiBase: string
  tokenUrl: string
  tradingEndpoint: string
}

export class EbayConfigError extends Error {}

/** אילו משתני סביבה חסרים — לתצוגת סטטוס, בלי לחשוף ערכים. */
export function missingEbayEnv(): string[] {
  return ['EBAY_APP_ID', 'EBAY_CERT_ID', 'EBAY_RUNAME'].filter((k) => !process.env[k])
}

export function getEbayConfig(): EbayConfig {
  const missing = missingEbayEnv()
  if (missing.length) throw new EbayConfigError(`חסרים משתני סביבה: ${missing.join(', ')}`)

  // כמו בקוד הקודם: sandbox הוא ברירת המחדל אלא אם EBAY_SANDBOX=false במפורש.
  const sandbox = process.env.EBAY_SANDBOX !== 'false'
  const apiBase = sandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com'

  return {
    appId: process.env.EBAY_APP_ID!,
    certId: process.env.EBAY_CERT_ID!,
    ruName: process.env.EBAY_RUNAME!,
    environment: sandbox ? 'sandbox' : 'production',
    sandbox,
    authBase: sandbox ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com',
    apiBase,
    tokenUrl: `${apiBase}/identity/v1/oauth2/token`,
    tradingEndpoint: `${apiBase}/ws/api.dll`,
  }
}
