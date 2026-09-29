'use client'

/**
 * SHAPE design system — React primitives over base.css.
 * Source of truth: ~/Projects/flowbot-license/src/web/ui.tsx.
 * Icons: Phosphor web font (ph / ph-bold / ph-fill classes).
 * UI strings are Hebrew; move them to the project's i18n if it has one.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* --------------------------------------------------------------- badges */

/** Tones: ok · warn · bad · gray · dark · blue · violet — each has --x and --x-bg. */
export type Tone = 'ok' | 'warn' | 'bad' | 'gray' | 'dark' | 'blue' | 'violet';
export const tone = (c: Tone) => ({ color: `var(--${c})`, background: `var(--${c}-bg)` });

/** A status pill. Map each domain status to a label + tone in ONE table per project, e.g.
 *  const STATUS = { active: ['פעיל', 'ok'], suspended: ['מושהה', 'warn'] } as const; */
export function Badge({ t, children, dot, large }: { t: Tone; children: ReactNode; dot?: boolean; large?: boolean }) {
  return (
    <span className={'badge' + (large ? ' lg' : '')} style={tone(t)}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

/** A KPI tile: icon tile, label, big mono number, one line of context, optional quota bar. */
export function Kpi({ icon, label, value, sub, critical, bar }: { icon: string; label: string; value: ReactNode; sub: string; critical?: boolean; bar?: number }) {
  return (
    <div className="card kpi" style={{ boxShadow: critical ? 'inset 0 0 0 1px var(--bad), var(--shadow)' : undefined }}>
      <span className="tile" style={critical ? { background: 'var(--bad-bg)', color: 'var(--bad)' } : undefined}>
        <i className={icon} />
      </span>
      <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{label}</div>
      <div className="mono kpi-value" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: critical ? 'var(--bad)' : 'var(--text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: critical ? 'var(--bad)' : 'var(--muted)' }}>{sub}</div>
      {bar !== undefined && (
        <div style={{ height: 6, borderRadius: 999, background: 'var(--hover2)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(bar, bar > 0 ? 1 : 0)}%`, borderRadius: 999, background: 'var(--accent)' }} />
        </div>
      )}
    </div>
  );
}

/** First-run empty state: big tinted icon, a title, one sentence of what happens next, one primary action. */
export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ padding: 'clamp(28px,5vw,56px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, maxWidth: 640 }}>
      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--tint)', color: 'var(--accent-text)', display: 'grid', placeItems: 'center', fontSize: 28 }}>
        <i className={icon} />
      </div>
      <h2 className="h2" style={{ fontSize: 22 }}>{title}</h2>
      <p style={{ margin: 0, color: 'var(--text2)', fontSize: 15, textWrap: 'pretty' }}>{text}</p>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- pills */

/** Options are [value, label] or [value, label, spoken name] when the label is not plain text. */
export function Pills<T extends string>({ options, value, onChange, label, tabs }: { options: ([T, ReactNode] | [T, ReactNode, string])[]; value: T; onChange: (v: T) => void; label: string; tabs?: boolean }) {
  return (
    <div className={'pills' + (tabs ? ' tabs' : '')} role={tabs ? 'tablist' : 'group'} aria-label={label}>
      {options.map(([v, l, spoken]) => (
        <button
          key={v}
          type="button"
          className={'pill' + (v === value ? ' on' : '')}
          role={tabs ? 'tab' : undefined}
          aria-selected={tabs ? v === value : undefined}
          aria-pressed={tabs ? undefined : v === value}
          aria-label={spoken}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="switch" onClick={() => onChange(!on)}>
      <span className="track">
        <span className="knob" />
      </span>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- modal */

export function Modal({ onClose, children, wide, label }: { onClose: () => void; children: ReactNode; wide?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // On a touch screen focusing a field would throw up the keyboard over
    // half the sheet before anything is read; the dialog itself takes focus.
    const touch = matchMedia('(pointer: coarse)').matches;
    const first = touch ? ref.current : ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={'dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={label} style={{ outline: 'none' }}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- toast */

type ToastT = { text: string; kind: 'ok' | 'bad'; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'bad', action?: ToastT['action']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastT | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string, kind: 'ok' | 'bad' = 'ok', action?: ToastT['action']) => {
    window.clearTimeout(timer.current);
    setToast({ text, kind, action });
    if (!action) timer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-icon" style={tone(toast.kind === 'bad' ? 'bad' : 'ok')}>
            <i className={toast.kind === 'bad' ? 'ph-fill ph-warning-circle' : 'ph-fill ph-check-circle'} />
          </span>
          <span style={{ fontWeight: 500, textWrap: 'pretty' }}>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="btn primary sm"
              style={{ boxShadow: 'none', height: 34, padding: '0 14px' }}
              onClick={() => {
                const run = toast.action?.run;
                setToast(null);
                run?.();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" aria-label="סגירה" className="btn ghost icon" style={{ width: 30, height: 30, color: 'var(--muted)', borderRadius: 8 }} onClick={() => setToast(null)}>
            <i className="ph ph-x" />
          </button>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------------------------------------------------------------- hooks */

export function useMobile(): boolean {
  // Next.js: אין window ברינדור בשרת — מתחילים ב-false ומתעדכנים אחרי mount.
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const on = () => setMobile(window.innerWidth < 860);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return mobile;
}

/** Load once, reload on demand; errors become a message, not a crash. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }, []);
  useEffect(() => {
    setData(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload };
}

export function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="card pad" style={{ alignItems: 'flex-start' }}>
      <div className="alert-box" style={tone('bad')}>
        <i className="ph-fill ph-warning-circle" />
        <span>{error}</span>
      </div>
      <button type="button" className="btn xs" onClick={retry}>
        נסה שוב
      </button>
    </div>
  );
}

export type FieldStatus = 'dirty' | 'saved' | null;

/** "Not saved" / "Saved ✓" beside a field's label — the same mark on every form. */
export function StatusMark({ status }: { status: FieldStatus | undefined }) {
  if (!status) return null;
  return status === 'dirty' ? (
    <span className="field-mark dirty" role="status">
      <span className="dot" />
      לא נשמר
    </span>
  ) : (
    <span className="field-mark saved" role="status">
      <i className="ph-bold ph-check" />
      נשמר
    </span>
  );
}

/**
 * Which fields of a form differ from what is saved, and which were just saved.
 * `draft` and `saved` are flat objects with the same keys.
 */
export function useFieldStatus<T extends Record<string, unknown>>(draft: T, saved: T) {
  const [justSaved, setJustSaved] = useState<string[]>([]);
  const timer = useRef<number>(0);
  const same = (k: string) => JSON.stringify(draft[k] ?? '') === JSON.stringify(saved[k] ?? '');
  const dirtyKeys = Object.keys(draft).filter((k) => !same(k));
  return {
    status: (k: keyof T & string): FieldStatus => (!same(k) ? 'dirty' : justSaved.includes(k) ? 'saved' : null),
    dirty: dirtyKeys.length > 0,
    /** Call right after a successful save: the fields that were changed flash "saved". */
    markSaved: (keys: string[] = dirtyKeys) => {
      window.clearTimeout(timer.current);
      setJustSaved(keys);
      timer.current = window.setTimeout(() => setJustSaved([]), 4000);
    },
  };
}

export function Field({ label, children, hint, error, required, status }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; status?: FieldStatus }) {
  return (
    <label className={'field' + (status === 'dirty' ? ' is-dirty' : status === 'saved' ? ' is-saved' : '')}>
      <span className="label">
        {label}
        {required && <span className="req"> *</span>}
        <StatusMark status={status} />
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </label>
  );
}
