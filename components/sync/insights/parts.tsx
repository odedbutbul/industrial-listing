'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus } from 'lucide-react'
import { compact, date, num } from '../format'
import { termById, termHref } from '../glossary'
import { Pill } from '../ui'

// רכיבי מסך התובנות. רק מחלקות ax-* ומשתני --ax-*.

/* ───────────────────────────── מונח עם קישור למילון ───────────────────────────── */

/** תווית שמקשרת להסבר במילון המונחים */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const t = termById.get(id)
  return (
    <Link href={termHref(id)} title={t ? `${t.term}${t.en ? ` (${t.en})` : ''} — מה זה?` : undefined} style={{ color: 'inherit', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
      {children ?? t?.term ?? id}
    </Link>
  )
}

/* ───────────────────────────── KPI עם שינוי ───────────────────────────── */

export interface DeltaKpiProps {
  term: string
  label?: string
  value: ReactNode
  cur: number | null
  prev: number | null
  /** true כשירידה היא שיפור (מיקום, נטישה, עלות) */
  lowerIsBetter?: boolean
  sub?: ReactNode
  /** שינוי בנקודות אחוז (למדדים שהם אחוזים) במקום שינוי יחסי */
  points?: boolean
}

export function DeltaKpi({ term, label, value, cur, prev, lowerIsBetter, sub, points }: DeltaKpiProps) {
  return (
    <div className="ax-card ax-kpi">
      <span className="ax-kpi-label">
        <Term id={term}>{label}</Term>
      </span>
      <span className="ax-kpi-value">{value}</span>
      <span className="ax-kpi-sub" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Delta cur={cur} prev={prev} lowerIsBetter={lowerIsBetter} points={points} />
        {sub}
      </span>
    </div>
  )
}

export function Delta({ cur, prev, lowerIsBetter, points }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean; points?: boolean }) {
  if (cur === null || prev === null || (!points && prev === 0)) return <span>אין נתון להשוואה</span>
  const diff = points ? (cur - prev) * 100 : ((cur - prev) / Math.abs(prev)) * 100
  const flat = Math.abs(diff) < (points ? 0.1 : 1)
  const good = flat ? null : diff > 0 !== !!lowerIsBetter
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight
  const text = `${diff > 0 ? '+' : ''}${diff.toFixed(Math.abs(diff) < 10 ? 1 : 0)}${points ? '' : '%'}`
  return (
    <span className={`ax-pill tone-${good === null ? 'gray' : good ? 'ok' : 'bad'}`} title={points ? 'שינוי בנקודות אחוז מול התקופה הקודמת' : 'מול התקופה הקודמת'}>
      <Icon size={13} aria-hidden="true" />
      {flat ? (
        <span>ללא שינוי</span>
      ) : (
        <>
          <span className="ax-num ax-ltr">{text}</span>
          {points && <span>נק׳</span>}
        </>
      )}
      <span className="ax-sr">{good === null ? 'ללא שינוי' : good ? 'שיפור' : 'הרעה'} מול התקופה הקודמת</span>
    </span>
  )
}

/* ───────────────────────────── גרף יומי ───────────────────────────── */

export interface ChartPoint {
  date: string
  value: number
}

/** עמודות יומיות, סדרה אחת (בלי מקרא — הכותרת מציינת את המדד). ריחוף/פוקוס מציג ערך. */
export function DailyBars({ points, label, format = (v) => num(Math.round(v)) }: { points: ChartPoint[]; label: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(0, ...points.map((p) => p.value))
  const top = niceMax(max)
  const total = points.reduce((a, p) => a + p.value, 0)
  const h = hover !== null ? points[hover] : null
  return (
    <figure style={{ margin: 0 }} aria-label={`${label}: סה״כ ${format(total)} ב-${points.length} ימים`}>
      <div style={{ display: 'flex', gap: 8, direction: 'ltr' }}>
        {/* ציר ערכים */}
        <div className="ax-num" aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: 'var(--ax-muted)', height: 180, textAlign: 'right', minWidth: 34 }}>
          <span>{compact(top)}</span>
          <span>{compact(top / 2)}</span>
          <span>0</span>
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {/* קווי רשת עדינים */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, height: 180, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ borderTop: '1px solid var(--ax-line)' }} />
            ))}
          </div>
          <div role="list" style={{ position: 'relative', height: 180, display: 'flex', alignItems: 'flex-end', gap: 2 }} onMouseLeave={() => setHover(null)}>
            {points.map((p, i) => (
              <div
                key={p.date}
                role="listitem"
                tabIndex={0}
                aria-label={`${date(p.date)}: ${format(p.value)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default', outlineOffset: 2 }}
              >
                <div
                  style={{
                    width: '100%',
                    height: top ? `${Math.max(p.value > 0 ? 1.5 : 0, (p.value / top) * 100)}%` : 0,
                    background: 'var(--ax-accent)',
                    opacity: hover === null || hover === i ? 1 : 0.45,
                    borderRadius: '4px 4px 0 0',
                  }}
                />
              </div>
            ))}
          </div>
          {h && (
            <div
              role="status"
              style={{
                position: 'absolute',
                top: -6,
                left: `${((hover! + 0.5) / points.length) * 100}%`,
                transform: `translate(${hover! < points.length * 0.15 ? '-10%' : hover! > points.length * 0.85 ? '-90%' : '-50%'}, -100%)`,
                background: 'var(--ax-dialog)',
                boxShadow: 'var(--ax-ring), var(--ax-shadow)',
                borderRadius: 12,
                padding: '6px 10px',
                fontSize: 12.5,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                direction: 'rtl',
                zIndex: 2,
              }}
            >
              <span className="ax-num" style={{ color: 'var(--ax-muted)' }}>
                {date(h.date)}
              </span>{' '}
              · <span className="ax-num" style={{ fontWeight: 600 }}>{format(h.value)}</span>
            </div>
          )}
          <div className="ax-num" aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ax-muted)', marginTop: 6 }}>
            <span>{date(points[0]?.date)}</span>
            <span>{date(points[Math.floor(points.length / 2)]?.date)}</span>
            <span>{date(points[points.length - 1]?.date)}</span>
          </div>
        </div>
      </div>
    </figure>
  )
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow
  return 10 * pow
}

/* ───────────────────────────── משפך ───────────────────────────── */

export function Funnel({ steps }: { steps: { term: string; label: string; value: number }[] }) {
  const first = steps[0]?.value || 0
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        const share = first ? s.value / first : 0
        return (
          <li key={s.term} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5 }}>
              <Term id={s.term}>{s.label}</Term>
              <span>
                <span className="ax-num" style={{ fontWeight: 600 }}>
                  {num(s.value)}
                </span>
                {prev !== null && (
                  <span className="ax-muted" style={{ fontSize: 12.5 }}>
                    {' '}
                    · <span className="ax-num">{prev ? `${((s.value / prev) * 100).toFixed(1)}%` : '—'}</span> מהשלב הקודם
                  </span>
                )}
              </span>
            </div>
            <div className="ax-bar" role="presentation">
              <span style={{ width: `${Math.max(s.value ? 1 : 0, share * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ───────────────────────────── טבלה ↔ כרטיסים ───────────────────────────── */

export interface Col<T> {
  key: string
  label: ReactNode
  /** שם קצר לכרטיס במובייל */
  short?: string
  render: (row: T) => ReactNode
  num?: boolean
  minWidth?: number
}

/** טבלה בדסקטופ וכרטיסים בנייד מאותם נתונים. העמודה הראשונה = כותרת הכרטיס. */
export function DataTable<T>({ rows, cols, rowKey, label, empty, minWidth = 720 }: { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; label: string; empty: string; minWidth?: number }) {
  if (!rows.length) return <p className="ax-note">{empty}</p>
  const [head, ...rest] = cols
  return (
    <>
      <div className="ax-only-desktop">
        <div className="ax-table-wrap">
          <table className="ax-table" style={{ minWidth }} aria-label={label}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rowKey(r)}>
                  {cols.map((c) => (
                    <td key={c.key} className={c.num ? 'ax-num' : undefined} style={{ minWidth: c.minWidth, whiteSpace: c.num ? 'nowrap' : undefined }}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ax-only-mobile ax-mcards">
        {rows.map((r) => (
          <div key={rowKey(r)} className="ax-mcard" style={{ gap: 8 }}>
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{head.render(r)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5 }}>
              {rest.map((c) => (
                <span key={c.key}>
                  <span className="ax-muted">{c.short ?? (typeof c.label === 'string' ? c.label : c.key)}: </span>
                  <span className={c.num ? 'ax-num' : undefined}>{c.render(r)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ───────────────────────────── כתובת דף ───────────────────────────── */

export function PageCell({ path, name, productId, siteUrl }: { path: string; name?: string | null; productId?: string | null; siteUrl?: string | null }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
      {name ? productId ? <Link href={`/sync/products/${productId}`} className="ax-row-title">{name}</Link> : <span className="ax-row-title">{name}</span> : null}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <span className="ax-num ax-ltr ax-muted" dir="ltr" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
          {path}
        </span>
        {siteUrl && (
          <a href={siteUrl.replace(/\/$/, '') + path} target="_blank" rel="noreferrer" aria-label={`פתיחת ${path} באתר (בלשונית חדשה)`} style={{ display: 'inline-flex' }}>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        )}
      </span>
    </span>
  )
}

/* ───────────────────────────── מדד בתא ───────────────────────────── */

export const SEVERITY: Record<'high' | 'medium' | 'low', [string, 'bad' | 'warn' | 'gray']> = {
  high: ['חשוב', 'bad'],
  medium: ['כדאי', 'warn'],
  low: ['הזדמנות', 'gray'],
}

export function SeverityPill({ s }: { s: 'high' | 'medium' | 'low' }) {
  return (
    <Pill t={SEVERITY[s][1]} dot>
      {SEVERITY[s][0]}
    </Pill>
  )
}
