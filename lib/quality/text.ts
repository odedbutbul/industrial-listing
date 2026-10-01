// כלי טקסט לבדיקת איכות מודעות: ניקוי HTML, נרמול, זיהוי מספרי דגם והשוואה "כמעט זהה".
// פונקציות טהורות — בלי DB ובלי רשת.

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—' }

/** HTML → טקסט רגיל (בלי סקריפטים/סגנונות, ישויות מפוענחות, רווחים מכווצים). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** אותיות ומספרים בלבד, באותיות גדולות — "SIM18-BMS64R 2H" → "SIM18BMS64R2H". */
export function squash(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** ערכים שלא אומרים כלום כמותג / דגם */
const EMPTY_VALUES = new Set(['', 'NA', 'NONE', 'DOESNOTAPPLY', 'UNBRANDED', 'GENERIC', 'UNKNOWN', 'NOBRAND', 'OEM', 'CUSTOM', 'SEEDESCRIPTION', 'MULTIPLE', 'VARIOUS'])

export function isMeaningful(squashed: string): boolean {
  return !EMPTY_VALUES.has(squashed)
}

// יחידות ומידות — "250V", "6A", "50/60HZ", "12.57MM", "10PCS" — אינן מספרי דגם
const UNIT = /^\d+([.,/]\d+)*(V|VAC|VDC|KV|A|MA|W|KW|MW|HZ|KHZ|MHZ|GHZ|MM|CM|M|NM|UM|IN|PCS|PC|X|MBAR|BAR|KPA|PA|PSI|UF|NF|PF|MF|F|OHM|K|RPM|L|ML|G|KG|LB|LBS|C|DEG|DB|AH|MAH|VA|KVA|BIT|GB|MB|TB|CH|PIN|PINS|WAY|POLE|TH|ST|ND|RD|MIN|MS|US|POS|DAY|DAYS|TRACK|AXIS|PORT|PORTS|CORE)$/
const YEAR = /^(19[5-9]\d|20[0-4]\d)$/

/**
 * מספרי דגם / מק"ט יצרן מתוך טקסט: מילה עם ספרה, 4+ תווים אחרי ניקוי, שאינה יחידת מידה או שנה.
 * מספר בלי אותיות נחשב דגם רק מ-5 ספרות (מתחת לזה זה בדרך כלל כמות / מידה). "REV. 03" לא נחשב.
 * מחזיר בצורה מנורמלת (squash), בלי כפילויות.
 */
export function modelTokens(text: string): string[] {
  const out = new Set<string>()
  for (const raw of dropRev(text).toUpperCase().split(/[\s,;()[\]{}|:"'!?]+/)) {
    const tok = raw.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
    if (!/\d/.test(tok)) continue
    if (UNIT.test(tok.replace(/[-_]/g, ''))) continue
    const sq = squash(tok)
    if (sq.length < 4 || YEAR.test(sq)) continue
    if (/^\d+$/.test(sq) && sq.length < 5) continue
    if (/^IP\d{2}$/.test(sq)) continue // דרגת אטימות
    out.add(sq)
  }
  return Array.from(out)
}

/** "REV. H" / "Rev: C" / "Revision B" → "H" / "C" / "B" — כדי ש-0637-988-01-H ו-"0637-988-01 REV. H" ייחשבו אותו דגם */
export function dropRev(s: string): string {
  return s.replace(/\b(REV(ISION)?)\b[.:#]?/gi, ' ')
}

/** פירוק שדה דגם שמכיל כמה דגמים: "853-230438-006, 853-230438-007" → שניים. פסיק בלי רווח הוא חלק מהדגם. */
export function splitParts(mpn: string): string[] {
  return mpn.split(/,\s+|;|\s+\/\s+|\s+&\s+/).map((x) => x.trim()).filter(Boolean)
}

/**
 * דגם שכמעט מופיע בכותרת: משווים מול רצפים של 1–4 מילים רצופות מהכותרת (לא מול קטע אקראי באמצע מילה),
 * באותו אורך אחרי squash, עם הבדל של 1–2 תווים. למשל X20BB81 מול "X20 BB 80". null = אין.
 */
export function nearMiss(needle: string, text: string): string | null {
  const n = needle.length
  if (n < 5) return null
  const maxDiff = n >= 10 ? 2 : 1
  const words = dropRev(text).toUpperCase().split(/[\s,;()[\]{}|:"'!?]+/).map(squash).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    let run = ''
    for (let k = i; k < Math.min(words.length, i + 4); k++) {
      run += words[k]
      if (run.length > n) break
      if (run.length < n) continue
      let d = 0
      for (let j = 0; j < n && d <= maxDiff; j++) if (run[j] !== needle[j]) d++
      // שני התווים הראשונים זהים — אחרת זה סתם מספר אחר, לא אותו דגם עם שינוי קטן
      if (d >= 1 && d <= maxDiff && run[0] === needle[0] && run[1] === needle[1]) return run
    }
  }
  return null
}

/** האם כל אחת מהמילים המשמעותיות של המותג מופיעה בטקסט (squash). "Allen-Bradley" ⇐ "ALLENBRADLEY". */
export function containsBrand(squashedText: string, brand: string): boolean {
  const sq = squash(brand)
  if (sq.length < 2) return true
  if (squashedText.includes(sq)) return true
  // מותג רב-מילי: מספיק שהמילה הראשונה (3+ תווים) מופיעה — "Texas Instruments" ⇐ "TEXAS"
  const first = squash(brand.split(/[\s/,&-]+/).find((w) => squash(w).length >= 3) ?? '')
  return first.length >= 3 && squashedText.includes(first)
}
