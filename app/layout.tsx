import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/ThemeProvider'
import BottomNav from '@/components/BottomNav'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo' })

export const metadata: Metadata = {
  title: 'י.פ. פתרונות טכניים — ניהול מוצרים',
  description: 'מערכת פרסום וניהול ציוד תעשייתי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} dark`} suppressHydrationWarning>
      <head>
        {/* מניעת FOUC — קורא theme לפני render */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme') || 'dark';
            document.documentElement.classList.toggle('dark', t === 'dark');
          } catch(e) {}
        `}} />
      </head>
      <body className="font-[family-name:var(--font-heebo)] antialiased min-h-screen pb-16 md:pb-0">
        <ThemeProvider>
          {children}
          <BottomNav />
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
