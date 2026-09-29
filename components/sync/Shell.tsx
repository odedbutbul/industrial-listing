'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, OPEN_IMPORT } from './api'
import { ImportDialog } from './ImportDialog'
import { labelTables } from './tables'
import type { EbayStatus } from './types'
import { useMobile } from './ui'

/**
 * מעטפת מסכי /sync: סרגל צד (מעל 860px), header עם חיפוש ופעולה ראשית, tab bar בטלפון.
 * לפי ~/Projects/flowbot-license/src/web/App.tsx.
 */

const NAV: [string, string, string][] = [
  ['/sync', 'סקירה', 'ph-house'],
  ['/sync/products', 'מוצרים', 'ph-package'],
  ['/sync/log', 'לוג', 'ph-list-bullets'],
  ['/sync/settings', 'הגדרות', 'ph-gear-six'],
]

const THEME_KEY = 'sync-theme'
type Theme = 'dark' | 'light'

let tablesLabelled = false

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const mobile = useMobile()
  const [importOpen, setImportOpen] = useState(false)
  const [ebay, setEbay] = useState<EbayStatus | null>(null)

  useEffect(() => {
    if (!tablesLabelled) {
      labelTables()
      tablesLabelled = true
    }
  }, [])

  useEffect(() => {
    const open = () => setImportOpen(true)
    window.addEventListener(OPEN_IMPORT, open)
    return () => window.removeEventListener(OPEN_IMPORT, open)
  }, [])

  useEffect(() => {
    api.get<EbayStatus>('/api/ebay/oauth/status').then(setEbay, () => setEbay(null))
  }, [pathname])

  const active = NAV.slice()
    .reverse()
    .find(([href]) => (href === '/sync' ? pathname === '/sync' : pathname.startsWith(href)))?.[0]

  return (
    <div className="root">
      <div className="app">
        {!mobile && (
          <aside className="side">
            <Brand />
            <nav aria-label="ניווט ראשי" className="nav">
              {NAV.map(([href, label, icon]) => {
                const on = href === active
                return (
                  <Link key={href} href={href} className={'nav-item' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} style={{ textDecoration: 'none' }}>
                    <i className={(on ? 'ph-fill ' : 'ph ') + icon} />
                    <span style={{ flex: 1 }}>{label}</span>
                  </Link>
                )
              })}
            </nav>
            <SideFoot ebay={ebay} />
          </aside>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <header className="header">
            <HeaderSearch />
            <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                aria-label="ייבוא מוצרים מ-eBay"
                className="btn primary"
                style={{ height: 44, padding: mobile ? '0 15px' : '0 18px', fontSize: 14 }}
                onClick={() => setImportOpen(true)}
              >
                <i className="ph-bold ph-download-simple" />
                {!mobile && <span>ייבוא מ-eBay</span>}
              </button>
              <UserMenu />
            </div>
          </header>

          <main className="main">{children}</main>
        </div>
      </div>

      {mobile && (
        <nav className="tabbar" aria-label="ניווט מהיר">
          {NAV.map(([href, label, icon]) => {
            const on = href === active
            return (
              <Link key={href} href={href} className={'tab' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} style={{ textDecoration: 'none' }}>
                <span className="tab-icon">
                  <i className={(on ? 'ph-fill ' : 'ph ') + icon} />
                </span>
                {label}
              </Link>
            )
          })}
        </nav>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
      <div className="brand">
        <i className="ph-bold ph-arrows-left-right" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
        <span className="rubik" style={{ fontWeight: 600, fontSize: 15.5 }}>
          סנכרון מלאי
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>eBay ↔ WooCommerce</span>
      </div>
    </div>
  )
}

/** כל מסך מראה את מצב החיבורים — חיבור שנפל לא מחכה שמישהו יפתח הגדרות. */
function SideFoot({ ebay }: { ebay: EbayStatus | null }) {
  const ebayState: [string, string] = !ebay
    ? ['לא נבדק', 'var(--muted)']
    : !ebay.configured
      ? ['לא הוגדר', 'var(--muted)']
      : ebay.connected
        ? ['מחובר', 'var(--ok)']
        : ['לא מחובר', 'var(--bad)']
  const rows: [string, [string, string]][] = [
    ['eBay', ebayState],
    ['WooCommerce', ['לא הוגדר', 'var(--muted)']],
  ]
  return (
    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="inner" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 6 }}>
        {rows.map(([label, [text, color]]) => (
          <Link key={label} href="/sync/settings" className="nav-item" style={{ height: 34, fontSize: 13, gap: 8, textDecoration: 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ fontSize: 12, color }}>{text}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** חיפוש ב-header: Enter מעביר לרשימת המוצרים מסוננת. */
function HeaderSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="search"
      onSubmit={(e) => {
        e.preventDefault()
        const v = q.trim()
        router.push(v ? `/sync/products?q=${encodeURIComponent(v)}` : '/sync/products')
      }}
    >
      <i className="ph ph-magnifying-glass" />
      <input type="search" aria-label="חיפוש מוצר" placeholder="חיפוש: כותרת, SKU או מספר מודעה" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  )
}

function UserMenu() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const switchTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* חלון פרטי: הערכה פשוט לא נזכרת */
    }
    setTheme(next)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/login?from=/sync'
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="תפריט משתמש"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--tint)', boxShadow: 'var(--tint-ring)', color: 'var(--accent-text)', fontSize: 20, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
      >
        <i className="ph ph-user" />
      </button>
      {open && (
        <div role="menu" className="menu" style={{ insetInlineEnd: 0, width: 230 }}>
          <button type="button" role="menuitem" className="menu-item" onClick={switchTheme}>
            <i className={theme === 'dark' ? 'ph ph-sun' : 'ph ph-moon'} style={{ fontSize: 18 }} />
            {theme === 'dark' ? 'ערכה בהירה' : 'ערכה כהה'}
          </button>
          <a role="menuitem" className="menu-item" href="/dashboard" style={{ textDecoration: 'none' }}>
            <i className="ph ph-clock-counter-clockwise" style={{ fontSize: 18 }} />
            המערכת הישנה
          </a>
          <button type="button" role="menuitem" className="menu-item" onClick={logout}>
            <i className="ph ph-sign-out" style={{ fontSize: 18 }} />
            התנתקות
          </button>
        </div>
      )}
    </div>
  )
}
