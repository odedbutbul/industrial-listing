import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getEbayConfig, type EbayConfig } from './config'

// ניהול טוקן OAuth של eBay: התחברות, שמירה מוצפנת ב-ebay_tokens, וחידוש אוטומטי.

export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
]

/** cookie שמחזיק את ה-state של OAuth בין authorize ל-callback */
export const OAUTH_STATE_COOKIE = 'ebay-oauth-state'
/** לאן לחזור אחרי ההתחברות — רק מתוך רשימה סגורה */
export const OAUTH_RETURN_COOKIE = 'ebay-oauth-return'
export const OAUTH_RETURN_PATHS = ['/settings', '/sync/settings'] as const

/** מרווח ביטחון לפני פקיעת ה-access token */
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export class EbayAuthError extends Error {
  constructor(message: string, readonly needsReconnect = false) {
    super(message)
  }
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  token_type?: string
}

export function buildAuthorizeUrl(state: string, config: EbayConfig = getEbayConfig()): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    response_type: 'code',
    redirect_uri: config.ruName,
    scope: EBAY_SCOPES.join(' '),
    state,
  })
  return `${config.authBase}/oauth2/authorize?${params.toString()}`
}

async function requestToken(config: EbayConfig, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${config.appId}:${config.certId}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`
    // invalid_grant = ה-refresh token פג או בוטל — צריך להתחבר מחדש
    throw new EbayAuthError(`eBay token: ${msg}`, data.error === 'invalid_grant')
  }
  return data as TokenResponse
}

async function logAuth(action: string, success: boolean, error?: string, details?: Record<string, unknown>) {
  await db
    .insert(schema.syncLog)
    .values({ job: 'ebay-auth', channel: 'ebay', action, success, error, details })
    .catch((e) => console.error('[ebay-auth] failed to write sync_log', e))
}

/** החלפת ה-code מה-callback לטוקנים ושמירתם. */
export async function exchangeCodeAndSave(code: string): Promise<{ accessExpiresAt: Date }> {
  const config = getEbayConfig()
  try {
    const t = await requestToken(config, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.ruName,
    })
    if (!t.refresh_token) throw new EbayAuthError('eBay לא החזיר refresh token')

    const now = Date.now()
    const row = {
      environment: config.environment,
      accessTokenEnc: encryptSecret(t.access_token),
      accessExpiresAt: new Date(now + t.expires_in * 1000),
      refreshTokenEnc: encryptSecret(t.refresh_token),
      refreshExpiresAt: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000) : null,
      scopes: EBAY_SCOPES.join(' '),
    }
    await db
      .insert(schema.ebayTokens)
      .values(row)
      .onConflictDoUpdate({ target: schema.ebayTokens.environment, set: row })

    await logAuth('connect', true, undefined, {
      environment: config.environment,
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
    })
    return { accessExpiresAt: row.accessExpiresAt }
  } catch (err) {
    await logAuth('connect', false, String(err instanceof Error ? err.message : err))
    throw err
  }
}

/**
 * מחזיר access token תקף, ומחדש אותו אם הוא עומד לפוג.
 * החידוש רץ בתוך advisory lock כדי ששני תהליכים לא יחדשו במקביל.
 */
export async function getValidAccessToken(opts: { force?: boolean } = {}): Promise<string> {
  const config = getEbayConfig()

  const current = await db.query.ebayTokens.findFirst({
    where: eq(schema.ebayTokens.environment, config.environment),
  })
  if (!current) throw new EbayAuthError('אין חיבור ל-eBay — יש להתחבר בהגדרות', true)
  if (!opts.force && current.accessExpiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return decryptSecret(current.accessTokenEnc)
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'ebay-token-refresh:' + config.environment}))`)

    // ייתכן שתהליך אחר כבר חידש בזמן שחיכינו לנעילה
    const row = await tx.query.ebayTokens.findFirst({
      where: eq(schema.ebayTokens.environment, config.environment),
    })
    if (!row) throw new EbayAuthError('אין חיבור ל-eBay — יש להתחבר בהגדרות', true)
    if (!opts.force && row.accessExpiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
      return decryptSecret(row.accessTokenEnc)
    }
    if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= Date.now()) {
      await logAuth('refresh', false, 'refresh token expired')
      throw new EbayAuthError('תוקף החיבור ל-eBay פג — יש להתחבר מחדש בהגדרות', true)
    }

    try {
      const t = await requestToken(config, {
        grant_type: 'refresh_token',
        refresh_token: decryptSecret(row.refreshTokenEnc),
        scope: row.scopes,
      })
      const accessExpiresAt = new Date(Date.now() + t.expires_in * 1000)
      await tx
        .update(schema.ebayTokens)
        .set({ accessTokenEnc: encryptSecret(t.access_token), accessExpiresAt })
        .where(eq(schema.ebayTokens.id, row.id))
      await logAuth('refresh', true, undefined, { accessExpiresAt })
      return t.access_token
    } catch (err) {
      await logAuth('refresh', false, String(err instanceof Error ? err.message : err))
      throw err
    }
  })
}

export interface EbayConnectionStatus {
  environment: 'sandbox' | 'production'
  connected: boolean
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
  scopes: string[]
  updatedAt: Date | null
}

/** מצב החיבור לתצוגה — בלי טוקנים. */
export async function getConnectionStatus(): Promise<EbayConnectionStatus> {
  const config = getEbayConfig()
  const row = await db.query.ebayTokens.findFirst({
    where: eq(schema.ebayTokens.environment, config.environment),
  })
  return {
    environment: config.environment,
    connected: !!row,
    accessExpiresAt: row?.accessExpiresAt ?? null,
    refreshExpiresAt: row?.refreshExpiresAt ?? null,
    scopes: row ? row.scopes.split(' ') : [],
    updatedAt: row?.updatedAt ?? null,
  }
}
