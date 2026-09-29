// נרמול כתובות דף, כדי ש-Search Console (כתובת מלאה), GA4 (נתיב) ו-WooCommerce (permalink) יתחברו.
// "/Product/ABC?x=1#y" → "/product/abc/"  ·  "https://shop.com/%D7%90/" → "/א/"

export function normalizePath(input: string | null | undefined): string {
  if (!input) return '/'
  let p = input.trim()
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname
  } catch {
    /* נשאר כמו שהוא */
  }
  p = p.split(/[?#]/)[0] || '/'
  try {
    p = decodeURI(p)
  } catch {
    /* קידוד שבור — משאירים */
  }
  if (!p.startsWith('/')) p = '/' + p
  if (!p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/'
  return p.toLowerCase()
}

/** YYYY-MM-DD ב-UTC, n ימים לפני היום */
export function daysAgo(n: number, from = new Date()): string {
  return new Date(from.getTime() - n * 86400_000).toISOString().slice(0, 10)
}
