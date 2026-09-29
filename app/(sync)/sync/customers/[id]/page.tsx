'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, ExternalLink, Mail, MailX, ShieldAlert, UserRound } from 'lucide-react'
import type { CustomerDetail } from '@/lib/customers/queries'
import { api } from '@/components/sync/api'
import { CardHead } from '@/components/sync/CardHead'
import { CHANNEL_LABEL, countryName, MARKETING, ORDER_STATE_LABEL } from '@/components/sync/customers'
import { date, dateTime, money, num } from '@/components/sync/format'
import { Field, LoadError, Modal, Pill, Spin, useLoad, useToast } from '@/components/sync/ui'

// דף לקוח: פרטים, מצב דיוור והזמנות. פעולות: הסכמה ידנית מתועדת, הסרה מדיוור, מחיקת פרטים.

const CONSENT_SOURCE: Record<string, string> = { woo_checkout: 'תיבת ההסכמה בקופה', manual: 'סימון ידני' }

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.get<CustomerDetail>(`/api/sync/customers/${id}`), [id])
  const [dialog, setDialog] = useState<'' | 'consent' | 'anonymize'>('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteErr, setNoteErr] = useState('')

  const back = (
    <Link href="/sync/customers" className="ax-back">
      <ArrowRight size={16} aria-hidden="true" />
      לקוחות
    </Link>
  )
  if (error)
    return (
      <>
        {back}
        <LoadError error={error} retry={reload} />
      </>
    )
  if (!data)
    return (
      <>
        {back}
        <div className="ax-skel" style={{ height: 60 }} />
        <div className="ax-skel" style={{ height: 260 }} />
      </>
    )

  const c = data.customer
  const gone = !!c.anonymizedAt
  const title = c.name ?? c.ebayUsername ?? (gone ? 'לקוח שנמחק' : 'ללא שם')

  const act = async (body: Record<string, string>, ok: string) => {
    setBusy(true)
    try {
      await api.post(`/api/sync/customers/${id}`, body)
      toast(ok)
      setDialog('')
      setNote('')
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה', 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {back}
        <div>
          <h1 className="ax-h1">{title}</h1>
          <p className="ax-sub">
            {num(c.orders)} הזמנות · {money(c.spent)} · לקוח מאז <span className="ax-num">{date(c.firstOrder ?? c.createdAt)}</span>
          </p>
        </div>
      </div>

      <div className="ax-grid-auto">
        <section className="ax-card" aria-labelledby="details-h">
          <CardHead id="details-h" icon={UserRound} title="פרטים" text={gone ? `הפרטים האישיים נמחקו ב-${date(c.anonymizedAt)}` : 'מתעדכנים מההזמנה האחרונה'} />
          {gone ? (
            <p className="ax-note">לפי בקשת הלקוח נמחקו שם, מייל, טלפון ועיר. ההזמנות נשארו לצורכי מלאי והכנסות.</p>
          ) : (
            <>
              <div className="ax-kv">
                <span>מייל</span>
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="ax-ltr" dir="ltr" style={{ overflowWrap: 'anywhere' }}>
                    {c.email}
                  </a>
                ) : (
                  <span className="ax-muted">לא ידוע</span>
                )}
              </div>
              <div className="ax-kv">
                <span>טלפון</span>
                {c.phone ? (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="ax-num ax-ltr" dir="ltr">
                    {c.phone}
                  </a>
                ) : (
                  <span className="ax-muted">לא ידוע</span>
                )}
              </div>
              <div className="ax-kv">
                <span>מיקום</span>
                <span>
                  {[c.city, c.region].filter(Boolean).map((v) => (
                    <span key={v}>
                      <bdi>{v}</bdi>,{' '}
                    </span>
                  ))}
                  {countryName(c.countryCode)}
                </span>
              </div>
              {c.ebayUsername && (
                <div className="ax-kv">
                  <span>משתמש eBay</span>
                  <a href={`https://www.ebay.com/usr/${encodeURIComponent(c.ebayUsername)}`} target="_blank" rel="noreferrer" className="ax-ltr" dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {c.ebayUsername}
                    <ExternalLink size={13} aria-hidden="true" />
                    <span className="ax-sr">(נפתח בלשונית חדשה)</span>
                  </a>
                </div>
              )}
              <div className="ax-kv">
                <span>הזמנה אחרונה</span>
                <span className="ax-num">{date(c.lastOrder)}</span>
              </div>
            </>
          )}
        </section>

        <section className="ax-card" aria-labelledby="mkt-h">
          <CardHead id="mkt-h" icon={Mail} title="דיוור" text="מותר לשלוח מבצעים רק למי שהסכים" pill={<Pill t={MARKETING[c.marketing][1]} dot>{MARKETING[c.marketing][0]}</Pill>} />
          <div className="ax-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
              {c.marketing === 'eligible'
                ? `הסכים לקבל עדכונים ומבצעים (${CONSENT_SOURCE[c.consentSource ?? ''] ?? c.consentSource ?? 'לא ידוע'}, ${dateTime(c.consentAt)}).${c.consentNote ? ` תיעוד: ${c.consentNote}` : ''}`
                : c.marketing === 'blocked_ebay'
                  ? 'קנה דרך eBay. לפי מדיניות eBay לא משתמשים בפרטים שלו לשיווק מחוץ ל-eBay, אלא אם הסכים בעצמו — למשל בקנייה באתר.'
                  : c.marketing === 'unsubscribed'
                    ? `ביקש להסיר את עצמו ב-${date(c.unsubscribedAt)}. לא שולחים לו דיוור, וגם הסכמה חדשה בקופה לא מחזירה אותו.`
                    : c.marketing === 'anonymized'
                      ? 'הפרטים נמחקו.'
                      : 'לא נתן הסכמה לדיוור.'}
            </p>
            {!gone && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {c.marketing !== 'eligible' && c.marketing !== 'unsubscribed' && (
                  <button type="button" className="ax-btn is-sm" onClick={() => setDialog('consent')} disabled={busy}>
                    <Mail size={16} aria-hidden="true" />
                    תיעוד הסכמה שהלקוח נתן
                  </button>
                )}
                {c.marketing === 'eligible' && (
                  <button type="button" className="ax-btn is-sm" onClick={() => act({ action: 'unsubscribe' }, 'הלקוח הוסר מהדיוור')} disabled={busy}>
                    {busy ? <Spin /> : <MailX size={16} aria-hidden="true" />}
                    הסרה מדיוור
                  </button>
                )}
                <button type="button" className="ax-btn is-sm is-ghost" onClick={() => setDialog('anonymize')} disabled={busy}>
                  <ShieldAlert size={16} aria-hidden="true" />
                  מחיקת הפרטים האישיים
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="ax-card" aria-labelledby="orders-h">
        <div className="ax-card-head">
          <h2 id="orders-h" className="ax-h2">
            הזמנות ({num(data.orders.length)})
          </h2>
        </div>
        {data.orders.length === 0 ? (
          <p className="ax-note">אין הזמנות מקושרות.</p>
        ) : (
          <div className="ax-rows">
            {data.orders.map((o) => (
              <div key={o.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--ax-line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <Link href={`/sync/orders?q=${encodeURIComponent(o.orderId)}`} className="ax-num ax-ltr" dir="ltr" style={{ fontWeight: 600 }}>
                      {o.orderId}
                    </Link>
                    <Pill t={CHANNEL_LABEL[o.channel][1]}>{CHANNEL_LABEL[o.channel][0]}</Pill>
                    <Pill t={ORDER_STATE_LABEL[o.state]?.[1] ?? 'gray'}>{ORDER_STATE_LABEL[o.state]?.[0] ?? o.state}</Pill>
                  </span>
                  <span className="ax-muted" style={{ fontSize: 13 }}>
                    <span className="ax-num">{dateTime(o.placedAt)}</span> · <span className="ax-num">{money(o.total, o.currency ?? 'USD')}</span>
                    {o.shipCountry ? ` · משלוח ל${countryName(o.shipCountry)}` : ''}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13.5, color: 'var(--ax-text2)' }}>
                  {o.lines.map((l, i) => (
                    <li key={i}>
                      {l.productId ? <Link href={`/sync/products/${l.productId}`}>{l.title ?? l.sku}</Link> : (l.title ?? l.sku ?? 'מוצר')}
                      {l.quantity > 1 && <span className="ax-num"> × {l.quantity}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {dialog === 'consent' && (
        <Modal
          title="תיעוד הסכמה לדיוור"
          onClose={() => !busy && setDialog('')}
          foot={
            <>
              <button type="button" className="ax-btn is-ghost" onClick={() => setDialog('')} disabled={busy}>
                ביטול
              </button>
              <button
                type="button"
                className="ax-btn is-primary"
                disabled={busy}
                onClick={() => {
                  if (note.trim().length < 5) return setNoteErr('כתוב איך ומתי הלקוח הסכים')
                  setNoteErr('')
                  void act({ action: 'consent', note: note.trim() }, 'ההסכמה תועדה')
                }}
              >
                {busy && <Spin />}
                שמירה
              </button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>רק אם הלקוח ביקש בעצמו לקבל עדכונים ומבצעים (בטלפון, במייל, בפנייה). ההסכמה נשמרת עם התאריך והתיעוד.</p>
          <Field id="consent-note" label="איך ומתי הלקוח הסכים" error={noteErr}>
            <input id="consent-note" className="ax-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: ביקש במייל ב-29/09 לקבל מבצעים" aria-invalid={!!noteErr} aria-describedby={noteErr ? 'consent-note-err' : undefined} />
          </Field>
        </Modal>
      )}

      {dialog === 'anonymize' && (
        <Modal
          title="מחיקת הפרטים האישיים"
          onClose={() => !busy && setDialog('')}
          foot={
            <>
              <button type="button" className="ax-btn is-ghost" onClick={() => setDialog('')} disabled={busy}>
                ביטול
              </button>
              <button type="button" className="ax-btn is-danger" disabled={busy} onClick={() => act({ action: 'anonymize' }, 'הפרטים האישיים נמחקו')}>
                {busy && <Spin />}
                מחיקה לצמיתות
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            נמחקים לצמיתות: שם, מייל, טלפון, עיר ושם המשתמש ב-eBay של <strong>{title}</strong>. ההזמנות נשארות (מלאי והכנסות). אי אפשר לבטל.
          </p>
          <p className="ax-hint" style={{ margin: 0 }}>
            משתמשים בזה כשהלקוח מבקש למחוק את המידע עליו. הפרטים נשארים ב-eBay ובחנות — שם צריך למחוק בנפרד.
          </p>
        </Modal>
      )}
    </>
  )
}
