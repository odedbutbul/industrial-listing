// בדיקה חד-פעמית: האם אפשר לקבל "פידבק שהקונה נתן למוכרים" (קריאה בלבד). לא כותב כלום ל-DB.
// מדפיס רק קודי תשובה, הודעות שגיאה ומספרים — בלי שמות משתמש.
//
//   node --env-file=.env node_modules/tsx/dist/cli.mjs jobs/probe-buyer-feedback.ts [--n=3]
//
// מה נבדק, על n לקוחות eBay עם ציון פידבק:
//   A. Feedback API (REST, commerce/feedback/v1) עם הטוקן של החשבון — feedback_type=FEEDBACK_SENT
//   B. אותו דבר עם טוקן אפליקציה (client credentials) ב-scope commerce.feedback.readonly
//   C. Trading GetFeedback עם UserID בשלוש צורות

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const FEEDBACK_SCOPE = 'https://api.ebay.com/oauth/api_scope/commerce.feedback.readonly'
const short = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').slice(0, 160)

async function main() {
  const n = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4)) || 3
  const { db, pool } = await import('@/lib/db/client')
  const { sql } = await import('drizzle-orm')
  const { getEbayConfig } = await import('@/lib/ebay/config')
  const { getValidAccessToken } = await import('@/lib/ebay/auth')
  const { assertEbayRestAllowed } = await import('@/lib/ebay/guard')
  const { tradingCall } = await import('@/lib/ebay/trading')
  try {
    const config = getEbayConfig()
    const users = (
      await db.execute(sql`select ebay_username u from customers where ebay_username is not null and ebay_username not like 'anon:%' and anonymized_at is null and ebay_feedback_score is not null order by ebay_feedback_score desc limit ${n}`)
    ).rows as { u: string }[]
    console.log(`לקוחות לבדיקה: ${users.length}`)

    // טוקן אפליקציה עם scope הפידבק — בקשת טוקן בלבד, לא פעולה בחשבון
    let appToken: string | null = null
    {
      const res = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${config.appId}:${config.certId}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: FEEDBACK_SCOPE }).toString(),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.access_token) appToken = d.access_token
      console.log(`B. טוקן אפליקציה עם commerce.feedback.readonly: ${appToken ? 'התקבל' : `נדחה — HTTP ${res.status} ${short(d.error_description ?? d.error)}`}`)
    }
    const userToken = await getValidAccessToken()

    const rest = async (token: string, u: string, filter?: string) => {
      const path = '/commerce/feedback/v1/feedback'
      assertEbayRestAllowed('GET', path)
      const url = new URL(path, config.apiBase)
      url.searchParams.set('user_id', u)
      url.searchParams.set('feedback_type', 'FEEDBACK_SENT')
      url.searchParams.set('limit', '25')
      if (filter) url.searchParams.set('filter', filter)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return `HTTP ${res.status} ${short(d?.errors?.[0]?.longMessage ?? d?.errors?.[0]?.message)}`
      const types = (d.feedbackEntries ?? []).reduce((m: Record<string, number>, e: { commentType?: string }) => ((m[e.commentType ?? '?'] = (m[e.commentType ?? '?'] ?? 0) + 1), m), {})
      return `OK total=${d.pagination?.total ?? '?'} בדף=${(d.feedbackEntries ?? []).length} ${JSON.stringify(types)}`
    }
    const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const trading = async (inner: string) => {
      try {
        const r = await tradingCall('GetFeedback', inner)
        const m = ((r.FeedbackSummary ?? {}) as Record<string, unknown>).BuyerRoleMetrics as Record<string, unknown> | undefined
        const p = (r.PaginationResult ?? {}) as Record<string, unknown>
        return `OK entries=${p.TotalNumberOfEntries ?? '?'} BuyerRoleMetrics=${m ? JSON.stringify(m) : 'אין'}`
      } catch (e) {
        return `שגיאה: ${short(e instanceof Error ? e.message : e)}`
      }
    }

    for (let i = 0; i < users.length; i++) {
      const u = users[i].u
      const id = xml(u)
      console.log(`\n— לקוח ${i + 1}`)
      console.log(`A. REST + טוקן החשבון, כל מה ששלח:       ${await rest(userToken, u)}`)
      if (appToken) {
        console.log(`B. REST + טוקן אפליקציה, כל מה ששלח:      ${await rest(appToken, u)}`)
        console.log(`B. REST + טוקן אפליקציה, שליליים ששלח:   ${await rest(appToken, u, 'commentType:NEGATIVE')}`)
        console.log(`B. REST + טוקן אפליקציה, ניטרליים ששלח:  ${await rest(appToken, u, 'commentType:NEUTRAL')}`)
      }
      console.log(`C1. GetFeedback UserID בלבד:              ${await trading(`  <UserID>${id}</UserID>`)}`)
      console.log(`C2. GetFeedback FeedbackLeft + ReturnAll: ${await trading(`  <UserID>${id}</UserID>\n  <FeedbackType>FeedbackLeft</FeedbackType>\n  <DetailLevel>ReturnAll</DetailLevel>\n  <Pagination><EntriesPerPage>25</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`)}`)
      console.log(`C3. GetFeedback ReturnAll:                ${await trading(`  <UserID>${id}</UserID>\n  <DetailLevel>ReturnAll</DetailLevel>\n  <Pagination><EntriesPerPage>25</EntriesPerPage><PageNumber>1</PageNumber></Pagination>`)}`)
    }
  } catch (err) {
    console.error('[probe-buyer-feedback] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
