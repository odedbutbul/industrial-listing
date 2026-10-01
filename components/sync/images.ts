// כתובות תמונות של eBay: מאותו מזהה תמונה אפשר לבקש כל גודל (s-l140 … s-l1600).

/** מזהה התמונה ב-eBay מתוך הכתובת: .../z/<id>/$_57.JPG או .../images/g/<id>/s-l140.jpg. null = לא תמונה של eBay */
export function ebayImageId(url: string): string | null {
  return url.match(/\/z\/([^/]+)\//)?.[1] ?? url.match(/\/images\/g\/([^/]+)\//)?.[1] ?? null
}

/** תמונה ממוזערת (140px) — לרשימות */
export function ebayThumb(url: string): string {
  const id = ebayImageId(url)
  return id ? `https://i.ebayimg.com/images/g/${id}/s-l140.jpg` : url
}

/** הגודל הגדול ביותר ש-eBay מגיש (עד 1600px) — לצפייה בגודל מלא. תמונה שאינה מ-eBay — כמו שהיא */
export function ebayFull(url: string): string {
  const id = ebayImageId(url)
  return id ? `https://i.ebayimg.com/images/g/${id}/s-l1600.jpg` : url
}
