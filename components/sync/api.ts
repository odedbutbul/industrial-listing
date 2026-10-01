// כל הקריאות לשרת ממסכי /sync. שגיאה הופכת להודעה בעברית; 401/הפניה ל-login מחזירה למסך הכניסה.

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly data: unknown = null) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'אין חיבור לשרת. בדוק את החיבור ונסה שוב')
  }
  // ה-middleware מפנה ל-/login כשה-cookie פג
  if (res.redirected && new URL(res.url).pathname === '/login') {
    window.location.href = '/login?from=' + encodeURIComponent(location.pathname)
    throw new ApiError(401, 'נדרשת כניסה מחדש')
  }
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null
  if (!res.ok) throw new ApiError(res.status, data?.error || `שגיאה ${res.status}`, data)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
}

/** מסכים מאזינים לזה כדי לטעון מחדש אחרי פעולה (למשל ייבוא) */
export const DATA_CHANGED = 'sync:data-changed'
export const announceDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED))

/** פתיחת דיאלוג הייבוא (שחי ב-Shell) מתוך מסך */
export const OPEN_IMPORT = 'sync:open-import'
export const openImport = () => window.dispatchEvent(new Event(OPEN_IMPORT))
