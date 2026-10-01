'use client'

import { Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Spin, useDismiss } from './ui'

export interface ComboOption {
  value: string
  /** שורה משנית (למשל מספר מוצרים) */
  meta?: string
}

/**
 * בחירה מרובה עם חיפוש: שדה קלט, תפריט נפתח מתחתיו (.ax-menu — רקע אטום של המערכת), ערכים נבחרים כתגיות.
 * source: חיפוש בשרת (מושהה 200ms) או רשימה קבועה. create: מאפשר ערך חדש שאינו ברשימה (מחזיר null = לא תקין).
 * נגישות: combobox + listbox, חיצים / Enter / Escape, Backspace בשדה ריק מסיר את האחרון.
 */
export function MultiCombobox({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  source,
  create,
  createLabel = 'הוספה',
  max = 30,
  tone = 'accent',
  firstBadge,
  placeholder = 'חיפוש…',
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string
  value: string[]
  onChange: (v: string[]) => void
  source: ((q: string) => Promise<ComboOption[]>) | ComboOption[]
  create?: (q: string) => string | null
  /** הטקסט לפני ערך חדש: "מותג חדש" → מותג חדש: Foo */
  createLabel?: string
  max?: number
  tone?: 'accent' | 'gray' | 'warn'
  /** תווית על התגית הראשונה (למשל "ראשי") */
  firstBadge?: string
  placeholder?: string
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [options, setOptions] = useState<ComboOption[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  // סגירה מנקה טקסט שלא נבחר — בחירה תמיד מפורשת (Enter / לחיצה)
  const close = () => {
    setOpen(false)
    setQ('')
  }
  const ref = useDismiss<HTMLDivElement>(open, close)

  // חיפוש: בשרת אחרי 200ms, או סינון של רשימה קבועה
  useEffect(() => {
    if (!open) return
    const lq = q.trim().toLowerCase()
    if (Array.isArray(source)) {
      const starts = (o: ComboOption) => o.value.toLowerCase().startsWith(lq) || !!o.meta?.toLowerCase().startsWith(lq)
      const hit = source.filter((o) => !lq || o.value.toLowerCase().includes(lq) || !!o.meta?.toLowerCase().includes(lq))
      // התאמה מתחילת השם קודם (rus → Russia לפני Belarus)
      setOptions((lq ? [...hit.filter(starts), ...hit.filter((o) => !starts(o))] : hit).slice(0, 60))
      return
    }
    let alive = true
    setLoading(true)
    const t = window.setTimeout(() => {
      source(q.trim())
        .then((r) => alive && setOptions(r))
        .catch(() => alive && setOptions([]))
        .finally(() => alive && setLoading(false))
    }, 200)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [q, open, source])

  const has = (v: string) => value.some((x) => x.toLowerCase() === v.toLowerCase())
  const shown = options.filter((o) => !has(o.value))
  const newValue = create && q.trim() ? create(q) : null
  const canCreate = !!newValue && !has(newValue) && !options.some((o) => o.value.toLowerCase() === newValue.toLowerCase())
  const items: { kind: 'opt' | 'new'; value: string; meta?: string }[] = [...shown.map((o) => ({ kind: 'opt' as const, ...o })), ...(canCreate ? [{ kind: 'new' as const, value: newValue! }] : [])]
  const full = value.length >= max

  useEffect(() => setActive(0), [q, options.length])

  const pick = (v: string) => {
    if (has(v) || full) return
    onChange([...value, v])
    setQ('')
    inputRef.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' || (e.key === ',' && create)) {
      if (!open && e.key === 'Enter') return
      e.preventDefault()
      const it = items[active] ?? (canCreate ? { value: newValue! } : null)
      if (it) pick(it.value)
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    } else if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1))
  }

  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className="ax-field">
      <label htmlFor={id} className="ax-label">
        {label}
      </label>
      {value.length > 0 && (
        <div className="ax-pf-chips" aria-label="נבחרו">
          {value.map((v, i) => (
            <span key={v} className={`ax-pill tone-${tone} ax-ltr`}>
              {v}
              {i === 0 && firstBadge && value.length > 1 && <span style={{ opacity: 0.75, fontWeight: 500 }}> · {firstBadge}</span>}
              <button type="button" aria-label={`הסרת ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="ax-combo">
        <div className="ax-search">
          {loading && open ? <Spin size={18} /> : <Search size={18} aria-hidden="true" />}
          <input
            ref={inputRef}
            id={id}
            className="ax-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            disabled={full}
            placeholder={full ? `עד ${max}` : placeholder}
            value={q}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            onKeyDown={onKey}
          />
        </div>
        {open && !full && (
          <ul id={listId} role="listbox" aria-label={typeof label === 'string' ? label : undefined} className="ax-menu ax-combo-menu">
            {items.map((it, i) => (
              <li
                key={it.kind + it.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={'ax-menu-item' + (i === active ? ' is-active' : '')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(it.value)}
              >
                {it.kind === 'new' && <Plus size={16} aria-hidden="true" />}
                {it.kind === 'new' ? (
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {createLabel}: <bdi dir="ltr" style={{ fontWeight: 600 }}>{it.value}</bdi>
                  </span>
                ) : (
                  <span dir="ltr" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {it.value}
                  </span>
                )}
                {it.meta && <span className="ax-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{it.meta}</span>}
              </li>
            ))}
            {!items.length && <li className="ax-combo-empty">{loading ? 'מחפש…' : q.trim() ? 'לא נמצא' : 'מקלידים כדי לחפש'}</li>}
            {create && !canCreate && (
              <li className="ax-combo-empty" role="presentation" style={{ borderTop: '1px solid var(--ax-line)', marginTop: 4 }}>
                <Plus size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> לא ברשימה? מקלידים את השם המלא ובוחרים &quot;{createLabel}&quot;
              </li>
            )}
          </ul>
        )}
      </div>
      {error ? (
        <span id={`${id}-err`} className="ax-hint" style={{ color: 'var(--ax-bad)' }}>
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="ax-hint">
            {hint}
          </span>
        )
      )}
    </div>
  )
}
