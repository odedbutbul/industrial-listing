'use client'

/**
 * SHAPE — רכיבי React מעל app-ui.css (מחלקות ax-*). אייקונים: lucide-react.
 * המבנה והמחלקות לפי quotes-app (components/app/*). הרכיבים עצמם הם עטיפות דקות —
 * אפשר גם לכתוב את ה-markup ישירות לפי references/design-system.md.
 */
import { AlertCircle, CheckCircle2, Loader2, X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/* ------------------------------------------------------------------ תגים */

/** כל טון = טקסט בצבע + רקע ב-`-bg` (tone-*). */
export type Tone = 'ok' | 'warn' | 'bad' | 'blue' | 'violet' | 'gray' | 'accent'

/** תג סטטוס. ממפים כל סטטוס של הדומיין לתווית + טון בטבלה אחת לכל פרויקט:
 *  const STATUS = { active: ['פעיל', 'ok'], paused: ['מושהה', 'warn'] } as const */
export function Pill({ t, children, dot }: { t: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`ax-pill tone-${t}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------- KPI */

/** אריח KPI: תווית, ערך mono גדול, שורת הקשר, ופס התקדמות אופציונלי (0–100). */
export function Kpi({ label, value, sub, bar, critical }: { label: string; value: ReactNode; sub?: ReactNode; bar?: number; critical?: boolean }) {
  return (
    <div className="ax-card ax-kpi" style={critical ? { boxShadow: 'inset 0 0 0 1px var(--ax-bad), var(--ax-shadow)' } : undefined}>
      <span className="ax-kpi-label">{label}</span>
      <span className="ax-kpi-value" style={critical ? { color: 'var(--ax-bad)' } : undefined}>
        {value}
      </span>
      {sub && (
        <span className="ax-kpi-sub" style={critical ? { color: 'var(--ax-bad)' } : undefined}>
          {sub}
        </span>
      )}
      {bar !== undefined && (
        <div className="ax-bar" role="presentation">
          <span style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- מצב ריק */

/** מצב ריק של עמוד: אריח אייקון, כותרת, משפט על מה שיקרה, ופעולה אחת. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="ax-card ax-empty">
      <span className="ax-tile is-lg" aria-hidden="true">
        <Icon size={24} />
      </span>
      <h2 className="ax-h2">{title}</h2>
      <p style={{ margin: 0, color: 'var(--ax-text2)' }}>{text}</p>
      {action}
    </div>
  )
}

/* ---------------------------------------------------------- מתג סינון */

/** מתג פילים לסינון (.ax-seg). options: [value, label, count?]. */
export function Seg<T extends string>({ options, value, onChange, label }: { options: [T, ReactNode, number?][]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ax-seg" role="group" aria-label={label}>
      {options.map(([v, l, count]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
          {count !== undefined && <span className="count ax-num">{count}</span>}
        </button>
      ))}
    </div>
  )
}

/** מתג הפעלה (הרחבת SHAPE — .ax-switch). */
export function Switch({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ax-switch" onClick={() => onChange(!on)}>
      <span className="track">
        <span className="knob" />
      </span>
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------- דיאלוג */

/**
 * דיאלוג: role="dialog" + aria-modal + aria-labelledby, Esc ולחיצה מחוץ סוגרים,
 * פוקוס נכנס פנימה ונחזר בסגירה. מבנה: ax-dialog-head / תוכן / ax-dialog-foot.
 */
export function Modal({ title, onClose, children, foot, maxWidth }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; maxWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useRef(`ax-dlg-${Math.random().toString(36).slice(2, 8)}`).current
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])

  return (
    <div className="ax-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="ax-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ outline: 'none', maxWidth }}>
        <div className="ax-dialog-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="ax-btn is-icon is-sm is-ghost" onClick={onClose} aria-label="סגירה">
            <X size={18} />
          </button>
        </div>
        {children}
        {foot && <div className="ax-dialog-foot">{foot}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ טוסט */

type ToastT = { text: string; kind: 'ok' | 'bad' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'bad') => void>(() => {})

/** הודעה צפה בתחתית המסך ל-3 שניות (שגיאה — 6, כדי שיספיקו לקרוא). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastT | null>(null)
  const timer = useRef<number>(0)
  const show = useCallback((text: string, kind: 'ok' | 'bad' = 'ok') => {
    window.clearTimeout(timer.current)
    setToast({ text, kind })
    timer.current = window.setTimeout(() => setToast(null), kind === 'bad' ? 6000 : 3000)
  }, [])

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">
        {toast && (
          <div className="ax-toast">
            {toast.kind === 'bad' ? <AlertCircle size={18} style={{ color: 'var(--ax-bad)' }} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/* ----------------------------------------------------------------- hooks */

/** סוגר תפריט צף בלחיצה מחוץ לו או ב-Escape (כמו ב-AppShell של quotes-app). */
export function useDismiss<T extends HTMLElement = HTMLDivElement>(open: boolean, close: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

/** טעינה פעם אחת + טעינה מחדש לפי בקשה; שגיאה הופכת להודעה, לא לקריסה. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    }
  }, [])
  useEffect(() => {
    setData(null)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error, reload }
}

export function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="ax-card ax-card-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
      <div className="ax-alert is-bad" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <span>{error}</span>
      </div>
      <button type="button" className="ax-btn is-sm" onClick={retry}>
        נסה שוב
      </button>
    </div>
  )
}

/** ספינר לכפתור בזמן פעולה (הכפתור עצמו disabled). */
export const Spin = ({ size = 16 }: { size?: number }) => <Loader2 size={size} className="ax-spin" aria-hidden="true" />

/* ----------------------------------------------------------------- טפסים */

export type FieldStatus = 'dirty' | 'saved' | null

/** "לא נשמר" / "נשמר" ליד תווית השדה — אותו סימון בכל טופס (הרחבת SHAPE). */
export function StatusMark({ status }: { status: FieldStatus | undefined }) {
  if (!status) return null
  return status === 'dirty' ? (
    <span className="ax-mark is-dirty" role="status">
      <span className="dot" />
      לא נשמר
    </span>
  ) : (
    <span className="ax-mark is-saved" role="status">
      נשמר ✓
    </span>
  )
}

/** אילו שדות שונים מהשמור, ואילו נשמרו זה עתה. draft ו-saved — אובייקטים שטוחים עם אותם מפתחות. */
export function useFieldStatus<T extends Record<string, unknown>>(draft: T, saved: T) {
  const [justSaved, setJustSaved] = useState<string[]>([])
  const timer = useRef<number>(0)
  const same = (k: string) => JSON.stringify(draft[k] ?? '') === JSON.stringify(saved[k] ?? '')
  const dirtyKeys = Object.keys(draft).filter((k) => !same(k))
  return {
    status: (k: keyof T & string): FieldStatus => (!same(k) ? 'dirty' : justSaved.includes(k) ? 'saved' : null),
    dirty: dirtyKeys.length > 0,
    markSaved: (keys: string[] = dirtyKeys) => {
      window.clearTimeout(timer.current)
      setJustSaved(keys)
      timer.current = window.setTimeout(() => setJustSaved([]), 4000)
    },
  }
}

/** שדה עם תווית (for/id), רמז ושגיאה מקושרים ב-aria-describedby. הילד מקבל את ה-id. */
export function Field({ id, label, hint, error, status, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; status?: FieldStatus; children: ReactNode }) {
  return (
    <div className={'ax-field' + (status === 'dirty' ? ' is-dirty' : status === 'saved' ? ' is-saved' : '')}>
      <label htmlFor={id} className="ax-label" style={{ width: '100%' }}>
        {label}
        <StatusMark status={status} />
      </label>
      {children}
      {hint && !error && (
        <span id={`${id}-hint`} className="ax-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="ax-hint" style={{ color: 'var(--ax-bad)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
