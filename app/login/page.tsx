'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        const from = searchParams.get('from') || '/dashboard'
        router.push(from)
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'שגיאה בהתחברות')
      }
    } catch {
      toast.error('שגיאת תקשורת')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-[#0f1117] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-orange-500 transition-colors text-base'

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* לוגו / כותרת */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⚙️</div>
          <h1 className="text-2xl font-bold text-white">י.פ. פתרונות טכניים</h1>
          <p className="text-white/40 text-sm mt-1">מערכת ניהול ציוד תעשייתי</p>
        </div>

        {/* כרטיס כניסה */}
        <div className="bg-[#1a1d24] border border-white/10 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-6 text-center">כניסה למערכת</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/50 text-sm mb-1.5">שם משתמש</label>
              <input
                type="text"
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="הכנס שם משתמש"
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-white/50 text-sm mb-1.5">סיסמה</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הכנס סיסמה"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors mt-2"
            >
              {loading ? 'מתחבר...' : 'כניסה'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
