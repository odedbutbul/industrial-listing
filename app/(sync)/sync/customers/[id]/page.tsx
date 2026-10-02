'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Info, Mail, MailX, PenLine, RotateCcw, ShieldAlert, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import type { CustomerDetail } from '@/lib/customers/queries'
import { api } from '@/components/sync/api'
import { CardHead } from '@/components/sync/CardHead'
import { ConductBadge } from '@/components/sync/ConductBadge'
import { BEHAVIOR, BEHAVIOR_HELP, CASE_KIND, CHANNEL_LABEL, countryName, INITIATOR, MARKETING, ORDER_STATE_LABEL, reasonLabel } from '@/components/sync/customers'
import { date, dateTime, money, num } from '@/components/sync/format'
import { Field, LoadError, Modal, Pill, Spin, useLoad, useToast } from '@/components/sync/ui'

// דף לקוח: התנהלות (סיכום + פרופיל eBay), פרטים, מצב דיוור, ביטולים / החזרים / קייסים והזמנות. פעולות: הסכמה ידנית מתועדת, הסרה מדיוור, מחיקת פרטים.

const CONSENT_SOURCE: Record<string, string> = { woo_checkout: 'תיבת ההסכמה בקופה', manual: 'סימון ידני' }

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.get<CustomerDetail>(`/api/sync/customers/${id}`), [id])
  const [dialog, setDialog] = useState<'' | 'consent' | 'anonymize' | 'conduct'>('')
  const [level, setLevel] = useState<'' | 'good' | 'ok' | 'watch' | 'risk'>('')
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
  const casesByOrder = new Map<string, typeof data.cases>()
  for (const k of data.cases) if (k.orderId) casesByOrder.set(k.orderId, [...(casesByOrder.get(k.orderId) ?? []), k])
  const title = c.name ?? c.ebayUsername ?? (gone ? 'לקוח שנמחק' : 'ללא שם')

  const act = async (body: Record<string, unknown>, ok: string) => {
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

      <Conduct
        c={c}
        onEdit={
          gone
            ? undefined
            : () => {
                setLevel(c.behavior.manual ? (c.behavior.level as 'good' | 'ok' | 'watch' | 'risk') : '')
                setNote(c.behavior.manual?.note ?? '')
                setNoteErr('')
                setDialog('conduct')
              }
        }
      />

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

      <Cases cases={data.cases} />

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
                    {(casesByOrder.get(o.orderId) ?? [])
                      .filter((k) => k.kind !== 'cancellation' || o.state !== 'cancelled')
                      .map((k) => (
                        <Pill key={k.id} t={CASE_KIND[k.kind][1]}>
                          {CASE_KIND[k.kind][0]}
                        </Pill>
                      ))}
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

      {dialog === 'conduct' && (
        <Modal
          title="שינוי ידני של דירוג ההתנהלות"
          onClose={() => !busy && setDialog('')}
          foot={
            <>
              {c.behavior.manual && (
                <button type="button" className="ax-btn is-ghost" style={{ marginInlineEnd: 'auto' }} disabled={busy} onClick={() => act({ action: 'conduct', level: null }, 'חזרה לדירוג האוטומטי')}>
                  חזרה לחישוב האוטומטי
                </button>
              )}
              <button type="button" className="ax-btn is-ghost" onClick={() => setDialog('')} disabled={busy}>
                ביטול
              </button>
              <button
                type="button"
                className="ax-btn is-primary"
                disabled={busy}
                onClick={() => {
                  if (!level) return setNoteErr('בחר דירוג')
                  if (note.trim().length < 3) return setNoteErr('כתוב למה הדירוג שונה')
                  setNoteErr('')
                  void act({ action: 'conduct', level, note: note.trim() }, 'הדירוג נשמר')
                }}
              >
                {busy && <Spin />}
                שמירה
              </button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            לפי החישוב האוטומטי: <strong>{BEHAVIOR[c.behavior.auto][0]}</strong>. הדירוג הידני מחליף אותו בכל המערכת; הסיבות שהמערכת מצאה ממשיכות להופיע.
          </p>
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="ax-label" style={{ marginBottom: 8 }}>
              דירוג
            </legend>
            {(['good', 'ok', 'watch', 'risk'] as const).map((l) => (
              <label key={l} className="ax-row-btn" style={{ alignItems: 'flex-start', boxShadow: level === l ? 'inset 0 0 0 2px var(--ax-accent)' : 'var(--ax-ring)' }}>
                <input type="radio" name="conduct-level" value={l} checked={level === l} onChange={() => setLevel(l)} style={{ marginTop: 4 }} />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <Pill t={BEHAVIOR[l][1]} dot>
                    {BEHAVIOR[l][0]}
                  </Pill>
                  <span className="ax-hint">{BEHAVIOR_HELP[l]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field id="conduct-note" label="למה" error={noteErr}>
            <input
              id="conduct-note"
              className="ax-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="למשל: ההחזרה הייתה טעות שלנו בתיאור"
              aria-invalid={!!noteErr}
              aria-describedby={noteErr ? 'conduct-note-err' : undefined}
            />
          </Field>
        </Modal>
      )}

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

type Detail = NonNullable<CustomerDetail>

const SIGNAL_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, gray: Info } as const

/** סיכום ההתנהלות: רמה, אותות (מה נחשב ולמה), ופרופיל הקונה ב-eBay */
function Conduct({ c, onEdit }: { c: Detail['customer']; onEdit?: () => void }) {
  const b = c.behavior
  const e = c.conduct.ebay
  const given = e ? (e.positiveLeft ?? 0) + (e.neutralLeft ?? 0) + (e.negativeLeft ?? 0) : 0
  return (
    <section className="ax-card" aria-labelledby="conduct-h">
      <CardHead
        id="conduct-h"
        icon={ShieldCheck}
        title="התנהלות"
        text={b.manual ? `נקבע ידנית${b.manual.at ? ` ב-${date(b.manual.at)}` : ''} · לפי החישוב: ${BEHAVIOR[b.auto][0]}` : 'מחושב מההזמנות, הביטולים, ההחזרות והפרופיל ב-eBay'}
        pill={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ConductBadge b={b} />
            {onEdit && (
              <button type="button" className="ax-btn is-icon is-sm is-ghost" onClick={onEdit} aria-label="שינוי ידני של הדירוג">
                <PenLine size={16} aria-hidden="true" />
              </button>
            )}
          </span>
        }
      />
      {b.manual?.note && (
        <p className="ax-hint" style={{ margin: 0, padding: '0 20px 12px' }}>
          הנימוק לדירוג הידני: <bdi>{b.manual.note}</bdi>
        </p>
      )}
      {b.signals.length === 0 ? (
        <p className="ax-note">{b.level === 'new' ? 'הזמנה אחת ועוד אין פרופיל eBay — אין עדיין על מה להסתמך.' : 'בלי ביטולים, החזרות או קייסים.'}</p>
      ) : (
        <ul className="ax-rows" style={{ margin: 0, listStyle: 'none' }}>
          {b.signals.map((x, i) => {
            const Icon = SIGNAL_ICON[x.tone]
            return (
              <li key={i} className="ax-row-btn" style={{ cursor: 'default', minHeight: 0, padding: '8px 14px' }}>
                <Icon size={17} aria-hidden="true" style={{ flexShrink: 0, color: x.tone === 'gray' ? 'var(--ax-muted)' : `var(--ax-${x.tone})` }} />
                <span>{x.text}</span>
              </li>
            )
          })}
        </ul>
      )}
      {e ? (
        <div style={{ borderTop: '1px solid var(--ax-line)' }}>
          <div className="ax-kv">
            <span>ציון פידבק ב-eBay</span>
            <span>
              <span className="ax-num">{e.feedbackScore === null ? '—' : num(e.feedbackScore)}</span>
              {c.ebayPositivePct !== null && (
                <>
                  {' · '}
                  <span className="ax-num">{c.ebayPositivePct}%</span> חיובי
                </>
              )}
            </span>
          </div>
          <div className="ax-kv">
            <span>פידבק שנתן למוכרים</span>
            {e.negativeLeft === null ? (
              <span className="ax-muted">לא זמין</span>
            ) : (
              <span>
                <span className="ax-num">{num(e.positiveLeft ?? 0)}</span> חיובי · <span className="ax-num">{num(e.neutralLeft ?? 0)}</span> ניטרלי · <span className="ax-num">{num(e.negativeLeft)}</span> שלילי
                {given > 0 && (
                  <span className="ax-muted">
                    {' '}
                    (<span className="ax-num">{Math.round(((e.negativeLeft ?? 0) / given) * 1000) / 10}%</span> שלילי)
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="ax-kv">
            <span>חשבון eBay נפתח</span>
            <span className="ax-num">{date(e.registeredAt)}</span>
          </div>
          <div className="ax-kv">
            <span>עודכן מ-eBay</span>
            <span className="ax-num">{date(e.fetchedAt)}</span>
          </div>
          {c.ebayProfileError && <p className="ax-hint" style={{ margin: 0, padding: '0 20px 14px' }}>חלק מהנתונים לא התקבלו: {c.ebayProfileError}</p>}
        </div>
      ) : c.ebayUsername ? (
        <p className="ax-hint" style={{ margin: 0, padding: '0 20px 16px' }}>
          הפרופיל ב-eBay (ציון, ותק, פידבק שנתן) עוד לא נמשך — מתעדכן בריצה הבאה של היסטוריית הלקוחות.
        </p>
      ) : null}
    </section>
  )
}

/** ביטולים, החזרים כספיים, בקשות החזרה, פניות וקייסים — טבלה במחשב, כרטיסים בטלפון */
function Cases({ cases }: { cases: Detail['cases'] }) {
  return (
    <section className="ax-card" aria-labelledby="cases-h">
      <CardHead id="cases-h" icon={RotateCcw} title={`ביטולים, החזרים וקייסים (${num(cases.length)})`} text="מ-eBay: ההזמנות (ביטולים והחזרים כספיים) ומרכז ההחזרות והקייסים" />
      {cases.length === 0 ? (
        <p className="ax-note">אין ביטולים, החזרים או קייסים.</p>
      ) : (
        <>
          <div className="ax-only-desktop">
            <div className="ax-table-wrap">
              <table className="ax-table" style={{ minWidth: 860 }}>
                <thead>
                  <tr>
                    <th>סוג</th>
                    <th>נפתח</th>
                    <th>הזמנה / פריט</th>
                    <th>סיבה</th>
                    <th>יזם</th>
                    <th>סכום</th>
                    <th>מצב</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <Pill t={CASE_KIND[k.kind][1]}>{CASE_KIND[k.kind][0]}</Pill>
                      </td>
                      <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                        {date(k.openedAt)}
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <CaseTarget k={k} />
                      </td>
                      <td>
                        {reasonLabel(k.reason) ?? <span className="ax-muted">—</span>}
                        {k.comment && (
                          <span className="ax-muted" style={{ display: 'block', fontSize: 12.5 }}>
                            <bdi>“{k.comment}”</bdi>
                          </span>
                        )}
                      </td>
                      <td>{k.initiator ? INITIATOR[k.initiator] : <span className="ax-muted">—</span>}</td>
                      <td className="ax-num" style={{ whiteSpace: 'nowrap' }}>
                        {k.amount !== null ? money(k.amount, k.currency ?? 'USD') : '—'}
                      </td>
                      <td>
                        <CaseState k={k} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="ax-only-mobile ax-mcards">
            {cases.map((k) => (
              <div key={k.id} className="ax-mcard" style={{ gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pill t={CASE_KIND[k.kind][1]}>{CASE_KIND[k.kind][0]}</Pill>
                  <CaseState k={k} />
                </div>
                <CaseTarget k={k} />
                <span className="ax-muted" style={{ fontSize: 12.5 }}>
                  <span className="ax-num">{date(k.openedAt)}</span>
                  {reasonLabel(k.reason) ? ` · ${reasonLabel(k.reason)}` : ''}
                  {k.initiator ? ` · יזם: ${INITIATOR[k.initiator]}` : ''}
                  {k.amount !== null ? (
                    <>
                      {' · '}
                      <span className="ax-num">{money(k.amount, k.currency ?? 'USD')}</span>
                    </>
                  ) : null}
                </span>
                {k.comment && (
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    <bdi>“{k.comment}”</bdi>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function CaseTarget({ k }: { k: Detail['cases'][number] }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {k.title && <span style={{ overflowWrap: 'anywhere' }}>{k.title}</span>}
      {k.orderId ? (
        <Link href={`/sync/orders?q=${encodeURIComponent(k.orderId)}`} className="ax-num ax-ltr" dir="ltr" style={{ fontSize: 12.5, textAlign: 'right' }}>
          {k.orderId}
        </Link>
      ) : k.itemId ? (
        <span className="ax-num ax-ltr ax-muted" dir="ltr" style={{ fontSize: 12.5, textAlign: 'right' }}>
          {k.itemId}
        </span>
      ) : (
        <span className="ax-muted">—</span>
      )}
    </span>
  )
}

function CaseState({ k }: { k: Detail['cases'][number] }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
      <Pill t={k.isOpen ? 'warn' : 'gray'} dot>
        {k.isOpen ? 'פתוח' : k.closedAt ? `נסגר ${date(k.closedAt)}` : 'נסגר'}
      </Pill>
      {k.status && (
        <span className="ax-muted ax-ltr" dir="ltr" style={{ fontSize: 11.5 }}>
          {k.status}
        </span>
      )}
    </span>
  )
}
