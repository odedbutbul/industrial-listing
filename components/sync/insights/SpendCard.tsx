'use client'

import { useState } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import type { SpendRow } from '@/lib/analytics/report'
import { api } from '../api'
import { CardHead } from '../CardHead'
import { money } from '../format'
import { Field, Spin, useToast } from '../ui'

/** הוצאות שיווק ידניות לפי חודש וערוץ — הבסיס ל-ROI / ROAS. אותו חודש + ערוץ מתעדכן. */
export function SpendCard({ rows, onChanged }: { rows: SpendRow[]; onChanged: () => void }) {
  const toast = useToast()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [channel, setChannel] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<number | 'save' | null>(null)
  const [err, setErr] = useState<Record<string, string>>({})

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!/^\d{4}-\d{2}$/.test(month)) errors.month = 'צריך לבחור חודש'
    if (!channel.trim()) errors.channel = 'למשל: Facebook, Google Ads, עמלות'
    if (amount === '' || !(Number(amount) >= 0)) errors.amount = 'סכום בדולרים, 0 ומעלה'
    setErr(errors)
    if (Object.keys(errors).length) return
    setBusy('save')
    try {
      await api.post('/api/sync/analytics/spend', { month, channel: channel.trim(), amount: Number(amount) })
      toast('ההוצאה נשמרה')
      setChannel('')
      setAmount('')
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'bad')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: number) => {
    setBusy(id)
    try {
      await api.post('/api/sync/analytics/spend', { deleteId: id })
      toast('ההוצאה נמחקה')
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'המחיקה נכשלה', 'bad')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="ax-card" aria-labelledby="spend-h">
      <CardHead id="spend-h" icon={Wallet} title="הוצאות שיווק" text="סכום חודשי לכל ערוץ, בדולרים. מתחלק לפי ימים בתקופה שנבחרה." />
      <form onSubmit={save} noValidate className="ax-card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12, alignItems: 'end' }}>
        <Field id="sp-month" label="חודש" error={err.month}>
          <input id="sp-month" type="month" className="ax-input ax-num" value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={!!err.month} aria-describedby={err.month ? 'sp-month-err' : undefined} />
        </Field>
        <Field id="sp-channel" label="ערוץ" error={err.channel}>
          <input id="sp-channel" className="ax-input" placeholder="Facebook" value={channel} onChange={(e) => setChannel(e.target.value)} aria-invalid={!!err.channel} aria-describedby={err.channel ? 'sp-channel-err' : undefined} list="sp-channels" />
        </Field>
        <datalist id="sp-channels">
          {Array.from(new Set(['Google Ads', 'Facebook', 'Instagram', 'LinkedIn', ...rows.map((r) => r.channel)])).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field id="sp-amount" label="סכום ($)" error={err.amount}>
          <input id="sp-amount" type="number" inputMode="decimal" min={0} step="0.01" className="ax-input ax-num" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!err.amount} aria-describedby={err.amount ? 'sp-amount-err' : undefined} />
        </Field>
        <button type="submit" className="ax-btn is-primary" disabled={busy !== null}>
          {busy === 'save' ? <Spin /> : <Plus size={18} aria-hidden="true" />}
          שמירה
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="ax-note" style={{ paddingTop: 0 }}>
          עוד לא הוזנו הוצאות. עלות Google Ads נמשכת אוטומטית אם החשבון מקושר ל-GA; כל השאר מוזן כאן.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.id} className="ax-kv">
              <span>
                <span className="ax-num">{r.month}</span> · {r.channel}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ax-num">{money(r.amount)}</span>
                <button type="button" className="ax-btn is-icon is-sm is-ghost" onClick={() => remove(r.id)} disabled={busy !== null} aria-label={`מחיקת ההוצאה ${r.channel} ${r.month}`}>
                  {busy === r.id ? <Spin /> : <Trash2 size={16} aria-hidden="true" />}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
