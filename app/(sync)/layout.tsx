import type { Metadata, Viewport } from 'next'
import '@/components/sync/fonts.css'
import { ThemeProvider } from '@/components/sync/ThemeProvider'
import { ToastProvider } from '@/components/sync/ui'
import { getUiTheme } from '@/lib/ui-theme-server'

// Root layout נפרד למסכי /sync (עיצוב shape-design, מחלקות ax-*). המסכים הישנים ב-app/(legacy) עם ה-layout שלהם.

export const metadata: Metadata = {
  title: 'סנכרון מלאי — eBay ↔ WooCommerce',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function SyncRootLayout({ children }: { children: React.ReactNode }) {
  // הערכה והמבטא מהעוגייה ui_theme — העמוד מרונדר בצבעים הנכונים בלי הבהוב
  const theme = await getUiTheme()
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0 }}>
        <ThemeProvider initial={theme}>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
