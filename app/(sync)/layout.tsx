import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/heebo'
import '@fontsource-variable/rubik'
import '@fontsource-variable/jetbrains-mono'
import '@phosphor-icons/web/regular'
import '@phosphor-icons/web/bold'
import '@phosphor-icons/web/fill'
import '@/components/sync/tokens.css'
import '@/components/sync/base.css'
import { ToastProvider } from '@/components/sync/ui'

// Root layout נפרד למסכי /sync (עיצוב shape-design). המסכים הישנים ב-app/(legacy) עם ה-layout שלהם.

export const metadata: Metadata = {
  title: 'סנכרון מלאי — eBay ↔ WooCommerce',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// כהה כברירת מחדל; בהיר רק אם נבחר ונשמר. רץ לפני הציור — בלי הבהוב.
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('sync-theme')==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`

export default function SyncRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
