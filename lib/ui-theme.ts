// ערכת צבעים של ממשק הניהול (לא של מסמך ההצעה — להצעה יש טוקנים משלה ב-lib/tokens.ts).
// המשתמש בוחר ערכת רקע (preset) וצבע מבטא (accent). שאר הצבעים הנגזרים מהמבטא מחושבים
// כאן בזמן ריצה, כולל התאמת ניגודיות — הצבע שהמשתמש בחר אינו ידוע בזמן פיתוח.

import { contrastRatio } from "@/lib/a11y/contrast";

export type UiMode = "dark" | "light";

export interface UiPreset {
  id: string;
  label: string;
  mode: UiMode;
  /** צבע המבטא המקורי של הערכה. */
  accent: string;
  /** משטח הייחוס שעליו נמדדת ניגודיות טקסט-מבטא (צבע הכרטיס בקירוב). */
  surface: string;
  /** צבעי תצוגה מקדימה בבורר: רקע, כרטיס. */
  preview: [string, string];
}

export const UI_PRESETS: UiPreset[] = [
  { id: "classic", label: "קלאסי", mode: "light", accent: "#4f46e5", surface: "#ffffff", preview: ["#f8fafc", "#ffffff"] },
  { id: "teal", label: "טורקיז לילי", mode: "dark", accent: "#4fd1c5", surface: "#133f40", preview: ["#0f3d3e", "#1a5352"] },
  { id: "graphite", label: "גרפיט", mode: "dark", accent: "#8b9cff", surface: "#1c1d21", preview: ["#111214", "#23252a"] },
  { id: "clean", label: "לבן נקי", mode: "light", accent: "#4f46e5", surface: "#ffffff", preview: ["#f3f4f6", "#ffffff"] },
  { id: "sunrise", label: "זריחה", mode: "light", accent: "#d4400e", surface: "#fff6ef", preview: ["#ffe4d1", "#fffaf6"] },
];

export const DEFAULT_PRESET = "classic";

/** צבעי מבטא מוצעים. "custom" = בורר צבע חופשי. */
export const UI_ACCENTS: Array<{ hex: string; label: string }> = [
  { hex: "#4fd1c5", label: "טורקיז" },
  { hex: "#22c55e", label: "ירוק" },
  { hex: "#3b82f6", label: "כחול" },
  { hex: "#4f46e5", label: "אינדיגו" },
  { hex: "#7c3aed", label: "סגול" },
  { hex: "#ec4899", label: "ורוד" },
  { hex: "#d4400e", label: "כתום" },
  { hex: "#f59e0b", label: "ענבר" },
];

export interface UiTheme {
  preset: string;
  /** null = צבע המבטא של הערכה. */
  accent: string | null;
}

export const UI_THEME_COOKIE = "ui_theme";

const HEX = /^#[0-9a-f]{6}$/i;

export function getPreset(id: string): UiPreset {
  return UI_PRESETS.find((p) => p.id === id) ?? UI_PRESETS[0];
}

/** ערך העוגייה: "preset" או "preset:#rrggbb". ערך לא תקין → ברירת מחדל. */
export function parseUiTheme(raw: string | undefined | null): UiTheme {
  if (!raw) return { preset: DEFAULT_PRESET, accent: null };
  const [p, a] = decodeURIComponent(raw).split(":");
  const preset = UI_PRESETS.some((x) => x.id === p) ? p : DEFAULT_PRESET;
  const accent = a && HEX.test(a) ? a.toLowerCase() : null;
  return { preset, accent };
}

export function serializeUiTheme(t: UiTheme): string {
  return t.accent ? `${t.preset}:${t.accent}` : t.preset;
}

// ── חישובי צבע ─────────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/** סיבוב גוון (HSL) — לגרדיאנט דו-גווני מצבע אחד. #4f46e5 +19° ≈ הסגול של העיצוב המקורי. */
function rotateHue(hex: string, deg: number): string {
  const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return hex;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

const INK_DARK = "#0b1416";
const INK_LIGHT = "#ffffff";

/** טקסט על רקע המבטא (כפתורים): הכהה או הבהיר — מה שנותן ניגודיות גבוהה יותר. */
export function onAccent(accent: string): string {
  return contrastRatio(INK_DARK, accent) >= contrastRatio(INK_LIGHT, accent) ? INK_DARK : INK_LIGHT;
}

/**
 * צבע הכפתור: המבטא שנבחר, ואם אף דיו (כהה/בהיר) לא מגיע עליו ל-4.5:1 — מוכהה בהדרגה עד שכן.
 * גווני ביניים (סגול/כחול בינוני) הם בדיוק המקרה שבו שני הדיו נכשלים.
 */
export function buttonAccent(accent: string): string {
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const c = mix(accent, "#000000", t);
    if (contrastRatio(onAccent(c), c) >= 4.5) return c;
  }
  return "#000000";
}

/** גרסת המבטא לטקסט/אייקונים על המשטח — מובהרת/מוכהית בהדרגה עד ניגודיות 4.5:1. */
export function accentText(accent: string, preset: UiPreset): string {
  const toward = preset.mode === "dark" ? "#ffffff" : "#000000";
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(accent, toward, t);
    if (contrastRatio(c, preset.surface) >= 4.5) return c;
  }
  return toward;
}

export interface UiContrastReport {
  /** ניגודיות צבע המבטא עצמו מול המשטח (רכיב גרפי — סף 3:1). */
  accentOnSurface: number;
  /** ניגודיות טקסט הכפתור מול המבטא (סף 4.5:1). */
  buttonText: number;
  /** ניגודיות טקסט-המבטא המותאם מול המשטח (סף 4.5:1). */
  accentTextOnSurface: number;
  /** האם צבע הכפתור או טקסט-המבטא הוזזו מהצבע שנבחר כדי לעבור את הסף. */
  adjusted: boolean;
}

export function uiContrastReport(theme: UiTheme): UiContrastReport {
  const preset = getPreset(theme.preset);
  const accent = theme.accent ?? preset.accent;
  const btn = buttonAccent(accent);
  const at = accentText(accent, preset);
  return {
    accentOnSurface: contrastRatio(btn, preset.surface),
    buttonText: contrastRatio(onAccent(btn), btn),
    accentTextOnSurface: contrastRatio(at, preset.surface),
    adjusted: btn !== accent.toLowerCase() || at !== accent.toLowerCase(),
  };
}

/** משתני CSS שנגזרים מצבע המבטא. משטחי הערכה עצמם מוגדרים ב-app-ui.css. */
export function uiThemeVars(theme: UiTheme): Record<string, string> {
  const preset = getPreset(theme.preset);
  const accent = theme.accent ?? preset.accent;
  const btn = buttonAccent(accent);
  const dark = preset.mode === "dark";
  return {
    "--ax-accent": btn,
    "--ax-on-accent": onAccent(btn),
    "--ax-accent-text": accentText(accent, preset),
    "--ax-tint": rgba(accent, dark ? 0.14 : 0.1),
    "--ax-tint-ring": `inset 0 0 0 1px ${rgba(accent, dark ? 0.26 : 0.22)}`,
    "--ax-glow": `0 10px 30px -10px ${rgba(accent, dark ? 0.5 : 0.45)}`,
    "--ax-accent-soft": rgba(accent, dark ? 0.17 : 0.14),
    "--ax-accent-2": rotateHue(btn, 19),
  };
}
