// חיבור ל-Gemini (Google AI Studio) — REST ישיר, בלי תלות. צד שרת בלבד.
//
// GEMINI_API_KEY          — המפתח מ-https://aistudio.google.com/apikey (לא נחשף, לא נכתב ללוג)
// GEMINI_MODEL            — ברירת מחדל gemini-3.1-flash-lite (הזול ביותר עם קריאת תמונות)
// GEMINI_MAX_USD_PER_RUN  — תקרת הוצאה לריצה אחת (ברירת מחדל 1 דולר). הריצה נעצרת כשמגיעים אליה.
// GEMINI_BASE_URL         — לבדיקות בלבד (Gemini מדומה מקומי)

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite'

/** מחיר לכל מיליון טוקנים בדולרים (מחירון גוגל, נבדק 01/10/2026). טוקני "חשיבה" מחויבים כפלט. */
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
}

export class GeminiConfigError extends Error {}
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function geminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new GeminiConfigError('חסר GEMINI_API_KEY — להוסיף ב-.env.local (מקומי) או ב-xCloud → Node.js → Environment')
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  const maxUsd = Number(process.env.GEMINI_MAX_USD_PER_RUN) > 0 ? Number(process.env.GEMINI_MAX_USD_PER_RUN) : 1
  const baseUrl = process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com'
  return { apiKey, model, maxUsd, baseUrl }
}

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY?.trim()

export function geminiCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model]
  if (!p) throw new GeminiConfigError(`אין מחיר במערכת למודל ${model} — להוסיף ל-PRICES ב-lib/google/gemini.ts`)
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

export interface GeminiResult<T> {
  data: T
  inputTokens: number
  /** פלט + חשיבה */
  outputTokens: number
  costUsd: number
  model: string
}

// מודלים שלא מקבלים thinkingConfig / mediaResolution — נזכרים כדי לא לשלם על שגיאה בכל קריאה
const unsupported = new Set<string>()

/** קריאה אחת שמחזירה JSON לפי schema (תת-קבוצה של OpenAPI, כמו ש-Gemini מקבל). */
export async function geminiJson<T>(parts: GeminiPart[], schema: object, opts: { signal?: AbortSignal } = {}): Promise<GeminiResult<T>> {
  const { apiKey, model, baseUrl } = geminiConfig()
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 }
  if (!unsupported.has(`${model}:media`)) generationConfig.mediaResolution = 'MEDIA_RESOLUTION_MEDIUM'
  if (!unsupported.has(`${model}:thinking`)) generationConfig.thinkingConfig = { thinkingLevel: 'minimal' }

  const res = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
  })
  const body = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    error?: { message?: string }
  } | null

  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`
    // שדה שהמודל לא מכיר → מנסים שוב בלעדיו (פעם אחת לכל שדה)
    if (res.status === 400 && /thinking/i.test(msg) && !unsupported.has(`${model}:thinking`)) {
      unsupported.add(`${model}:thinking`)
      return geminiJson(parts, schema, opts)
    }
    if (res.status === 400 && /media_?resolution/i.test(msg) && !unsupported.has(`${model}:media`)) {
      unsupported.add(`${model}:media`)
      return geminiJson(parts, schema, opts)
    }
    throw new GeminiError(`Gemini: ${msg.slice(0, 300)}`, res.status)
  }

  const u = body?.usageMetadata ?? {}
  const inputTokens = u.promptTokenCount ?? 0
  const outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
  const costUsd = geminiCost(model, inputTokens, outputTokens)
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let data: T
  try {
    data = JSON.parse(text) as T
  } catch {
    const e = new GeminiError(`Gemini החזיר תשובה שאינה JSON (${body?.candidates?.[0]?.finishReason ?? 'בלי סיבה'})`, 502) as GeminiError & { costUsd: number }
    e.costUsd = costUsd
    throw e
  }
  return { data, inputTokens, outputTokens, costUsd, model }
}
