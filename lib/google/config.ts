// הגדרות גוגל ממשתני סביבה בלבד. הערכים לא נחשפים — רק שמות המשתנים החסרים.
//
// GOOGLE_SERVICE_ACCOUNT_JSON — קובץ ה-JSON של ה-service account (כמו שהוא בשורה אחת, או ב-base64)
// GSC_SITE_URL                — הנכס ב-Search Console: `sc-domain:example.com` או `https://example.com/`
// GA4_PROPERTY_ID             — מספר הנכס ב-GA4 (ספרות בלבד, לא G-XXXX)

export interface ServiceAccount {
  clientEmail: string
  privateKey: string
}

export class GoogleConfigError extends Error {}

export function readServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) throw new GoogleConfigError('חסר GOOGLE_SERVICE_ACCOUNT_JSON')
  let json: { client_email?: string; private_key?: string }
  try {
    json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    throw new GoogleConfigError('GOOGLE_SERVICE_ACCOUNT_JSON אינו JSON תקין (אפשר להדביק את הקובץ בשורה אחת או ב-base64)')
  }
  if (!json.client_email || !json.private_key) throw new GoogleConfigError('ב-GOOGLE_SERVICE_ACCOUNT_JSON חסרים client_email או private_key')
  // מפתח שהודבק עם \n מילוליים
  return { clientEmail: json.client_email, privateKey: json.private_key.replace(/\\n/g, '\n') }
}

export function gscSiteUrl(): string | null {
  return process.env.GSC_SITE_URL?.trim() || null
}

export function ga4PropertyId(): string | null {
  const v = process.env.GA4_PROPERTY_ID?.trim().replace(/^properties\//, '')
  return v || null
}

export interface GoogleEnvStatus {
  serviceAccount: boolean
  /** כתובת המייל של ה-service account — צריך להוסיף אותה כמשתמש ב-GA וב-Search Console. לא סוד. */
  serviceAccountEmail: string | null
  serviceAccountError: string | null
  gsc: boolean
  ga4: boolean
  siteUrl: string | null
  propertyId: string | null
  missingEnv: string[]
}

export function googleEnvStatus(): GoogleEnvStatus {
  let email: string | null = null
  let saError: string | null = null
  try {
    email = readServiceAccount().clientEmail
  } catch (e) {
    saError = e instanceof Error ? e.message : String(e)
  }
  const siteUrl = gscSiteUrl()
  const propertyId = ga4PropertyId()
  const missingEnv = [!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && 'GOOGLE_SERVICE_ACCOUNT_JSON', !siteUrl && 'GSC_SITE_URL', !propertyId && 'GA4_PROPERTY_ID'].filter(Boolean) as string[]
  return {
    serviceAccount: !!email,
    serviceAccountEmail: email,
    serviceAccountError: process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ? saError : null,
    gsc: !!email && !!siteUrl,
    ga4: !!email && !!propertyId && /^\d+$/.test(propertyId),
    siteUrl,
    propertyId,
    missingEnv,
  }
}
