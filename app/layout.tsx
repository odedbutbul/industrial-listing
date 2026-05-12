import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo' })

export const metadata: Metadata = {
  title: 'י.פ. פתרונות טכניים — ניהול מוצרים',
  description: 'מערכת פרסום וניהול ציוד תעשייתי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-[family-name:var(--font-heebo)] bg-[#0f1117] text-white antialiased min-h-screen">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
