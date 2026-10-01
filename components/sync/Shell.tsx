'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Download, History, Inbox, LayoutDashboard, Lightbulb, LogOut, Menu, Package, Palette, Receipt, Scale, ScanSearch, ScrollText, Search, Settings, Star, Users, X } from 'lucide-react'
import { api, DATA_CHANGED, OPEN_IMPORT } from './api'
import { ImportDialog } from './ImportDialog'
import { ThemePicker } from './ThemePicker'
import type { EbayStatus, WooStatus } from './types'
import { useDismiss } from './ui'

/**
 * מעטפת מסכי /sync: סרגל צד (מגירה מימין ≤900px), כותרת עם חיפוש, פעולה ראשית, בורר צבעים ותפריט משתמש.
 * לפי ~/Projects/quotes-app/components/app/AppShell.tsx.
 */

const NAV = [
  { href: '/sync', label: 'סקירה', icon: LayoutDashboard },
  { href: '/sync/orders', label: 'הזמנות', icon: Receipt },
  { href: '/sync/customers', label: 'לקוחות', icon: Users },
  { href: '/sync/leads', label: 'לידים', icon: Inbox },
  { href: '/sync/products', label: 'מוצרים', icon: Package },
  { href: '/sync/pricing', label: 'מחירים', icon: Scale },
  { href: '/sync/quality', label: 'בדיקת מודעות', icon: ScanSearch },
  { href: '/sync/reviews', label: 'ביקורות', icon: Star },
  { href: '/sync/insights', label: 'תובנות', icon: Lightbulb },
  { href: '/sync/log', label: 'לוג', icon: ScrollText },
  { href: '/sync/settings', label: 'הגדרות', icon: Settings },
]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [importOpen, setImportOpen] = useState(false)
  const [ebay, setEbay] = useState<EbayStatus | null>(null)
  const [woo, setWoo] = useState<WooStatus | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [themeMenu, setThemeMenu] = useState(false)
  const userRef = useDismiss(userMenu, () => setUserMenu(false))
  const themeRef = useDismiss(themeMenu, () => setThemeMenu(false))

  useEffect(() => {
    const open = () => setImportOpen(true)
    window.addEventListener(OPEN_IMPORT, open)
    return () => window.removeEventListener(OPEN_IMPORT, open)
  }, [])

  useEffect(() => {
    api.get<EbayStatus>('/api/ebay/oauth/status').then(setEbay, () => setEbay(null))
    const loadWoo = () => api.get<WooStatus>('/api/sync/woo/status').then(setWoo, () => setWoo(null))
    loadWoo()
    // בדיקת חיבור במסך ההגדרות מעדכנת את הסטטוס בסרגל בלי ניווט
    window.addEventListener(DATA_CHANGED, loadWoo)
    return () => window.removeEventListener(DATA_CHANGED, loadWoo)
  }, [pathname])

  // המגירה נסגרת גם ב-Escape
  useEffect(() => {
    if (!drawer) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [drawer])

  const isActive = (href: string) => (href === '/sync' ? pathname === '/sync' : pathname === href || pathname.startsWith(href + '/'))

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.href = '/login?from=/sync'
  }

  return (
    <div className="ax-shell">
      {drawer && <div className="ax-drawer-overlay" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <aside className={'ax-side' + (drawer ? ' is-open' : '')} aria-label="סרגל צד">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/sync" className="ax-brand" onClick={() => setDrawer(false)} style={{ flex: 1, minWidth: 0 }}>
            <span className="ax-logo" aria-hidden="true">
              <ArrowLeftRight size={20} strokeWidth={2.2} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="ax-brand-name">סנכרון מלאי</span>
              <span className="ax-brand-sub ax-ltr" style={{ textAlign: 'right' }}>
                eBay ↔ WooCommerce
              </span>
            </span>
          </Link>
          {drawer && (
            <button type="button" className="ax-btn is-icon is-sm is-ghost" onClick={() => setDrawer(false)} aria-label="סגירת תפריט">
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="ax-nav" aria-label="ניווט ראשי">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="ax-nav-item" onClick={() => setDrawer(false)} aria-current={isActive(href) ? 'page' : undefined}>
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <SideFoot ebay={ebay} woo={woo} onNavigate={() => setDrawer(false)} />
      </aside>

      <div className="ax-body">
        <header className="ax-header">
          <button type="button" className="ax-btn is-icon ax-menu-btn" onClick={() => setDrawer(true)} aria-label="פתיחת תפריט" aria-expanded={drawer}>
            <Menu size={22} />
          </button>

          <HeaderSearch />

          <div className="ax-header-end">
            <button type="button" className="ax-btn is-primary" aria-label="ייבוא מוצרים מ-eBay" onClick={() => setImportOpen(true)}>
              <Download size={18} strokeWidth={2.4} aria-hidden="true" />
              <span className="ax-hide-sm">ייבוא מ-eBay</span>
            </button>

            <div ref={themeRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="ax-btn is-icon"
                onClick={() => (setThemeMenu((v) => !v), setUserMenu(false))}
                aria-label="צבעי הממשק"
                aria-expanded={themeMenu}
                title="צבעי הממשק"
              >
                <Palette size={20} />
              </button>
              {themeMenu && (
                <div className="ax-picker-pop" role="dialog" aria-label="צבעי הממשק">
                  <ThemePicker />
                </div>
              )}
            </div>

            <div ref={userRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="ax-avatar"
                onClick={() => (setUserMenu((v) => !v), setThemeMenu(false))}
                aria-label="תפריט משתמש"
                aria-expanded={userMenu}
                aria-haspopup="menu"
              >
                מנ
              </button>
              {userMenu && (
                <div className="ax-menu" role="menu">
                  <a role="menuitem" className="ax-menu-item" href="/dashboard">
                    <History size={18} aria-hidden="true" /> המערכת הישנה
                  </a>
                  <button type="button" role="menuitem" className="ax-menu-item" onClick={logout}>
                    <LogOut size={18} aria-hidden="true" /> התנתקות
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="ax-main">{children}</main>
      </div>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}

/** כל מסך מראה את מצב החיבורים — חיבור שנפל לא מחכה שמישהו יפתח הגדרות. */
function SideFoot({ ebay, woo, onNavigate }: { ebay: EbayStatus | null; woo: WooStatus | null; onNavigate: () => void }) {
  const ebayState: [string, string] = !ebay
    ? ['לא נבדק', 'gray']
    : !ebay.configured
      ? ['לא הוגדר', 'gray']
      : ebay.connected
        ? ['מחובר', 'ok']
        : ['לא מחובר', 'bad']
  const wooState: [string, string] = !woo
    ? ['לא נבדק', 'gray']
    : !woo.configured
      ? ['לא הוגדר', 'gray']
      : !woo.lastTest
        ? ['לא נבדק', 'warn']
        : woo.lastTest.ok
          ? ['מחובר', 'ok']
          : ['שגיאה', 'bad']
  const rows: [string, [string, string]][] = [
    ['eBay', ebayState],
    ['WooCommerce', wooState],
  ]
  return (
    <div className="ax-side-foot">
      <div className="ax-inner" style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(([label, [text, t]]) => (
          <Link key={label} href="/sync/settings" className="ax-nav-item" onClick={onNavigate} style={{ fontSize: 13.5 }}>
            <span style={{ flex: 1 }}>{label}</span>
            <span className={`ax-pill tone-${t}`}>
              <span className="dot" />
              {text}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** חיפוש בכותרת: Enter מעביר לרשימת המוצרים מסוננת. */
function HeaderSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="ax-search"
      onSubmit={(e) => {
        e.preventDefault()
        const v = q.trim()
        router.push(v ? `/sync/products?q=${encodeURIComponent(v)}` : '/sync/products')
      }}
    >
      <Search size={18} aria-hidden="true" />
      <input type="search" className="ax-input" aria-label="חיפוש מוצר" placeholder="חיפוש: כותרת, SKU או מספר מודעה" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  )
}
