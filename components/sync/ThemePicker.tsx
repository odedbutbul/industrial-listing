"use client";

import { Check, RotateCcw, AlertTriangle } from "lucide-react";
import { useUiTheme } from "./ThemeProvider";
import { getPreset, uiContrastReport, UI_ACCENTS, UI_PRESETS } from "@/lib/ui-theme";

/** בורר ערכת רקע + צבע מבטא לממשק הניהול. השינוי מיידי ונשמר בעוגייה. */
export function ThemePicker() {
  const { theme, setTheme } = useUiTheme();
  const preset = getPreset(theme.preset);
  const accent = theme.accent ?? preset.accent;
  const isPresetAccent = !theme.accent;
  const isSwatch = UI_ACCENTS.some((a) => a.hex === accent);
  const report = uiContrastReport(theme);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="ax-label" id="ax-preset-label">ערכת רקע</span>
        <div className="ax-presets" role="radiogroup" aria-labelledby="ax-preset-label">
          {UI_PRESETS.map((p) => {
            const on = p.id === preset.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="ax-preset"
                onClick={() => setTheme({ preset: p.id, accent: theme.accent })}
              >
                <span className="ax-preset-art" style={{ background: p.preview[0] }} aria-hidden="true">
                  <i style={{ background: p.preview[1] }} />
                  <b style={{ background: theme.accent ?? p.accent }} />
                </span>
                <span className="ax-preset-label">
                  {p.label}
                  {on && <Check size={15} aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="ax-label" id="ax-accent-label">צבע מבטא</span>
        <div className="ax-swatches" role="radiogroup" aria-labelledby="ax-accent-label">
          {UI_ACCENTS.map((a) => {
            const on = a.hex === accent;
            return (
              <button
                key={a.hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a.label}
                title={a.label}
                className="ax-swatch"
                style={{ background: a.hex }}
                onClick={() => setTheme({ preset: preset.id, accent: a.hex === preset.accent ? null : a.hex })}
              />
            );
          })}
          <label className="ax-swatch-custom" data-on={!isSwatch} title="צבע חופשי">
            <span className="ax-sr">צבע מבטא חופשי</span>
            <input
              type="color"
              value={accent}
              onChange={(e) => setTheme({ preset: preset.id, accent: e.target.value.toLowerCase() })}
            />
          </label>
          {!isPresetAccent && (
            <button
              type="button"
              className="ax-btn is-link"
              onClick={() => setTheme({ preset: preset.id, accent: null })}
            >
              <RotateCcw size={14} aria-hidden="true" /> צבע הערכה
            </button>
          )}
        </div>
      </div>

      {/* ניגודיות נמדדת על הצבע שנבחר בפועל. טקסט המבטא מותאם אוטומטית ל-4.5:1. */}
      <p className="ax-hint ax-num" style={{ margin: 0, fontFamily: "inherit" }} aria-live="polite">
        ניגודיות: טקסט כפתור {report.buttonText.toFixed(1)}:1 · טקסט מבטא {report.accentTextOnSurface.toFixed(1)}:1
        {report.adjusted && " (הותאם אוטומטית)"}
      </p>
      {report.accentOnSurface < 3 && (
        <div className="ax-alert is-warn" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            הצבע קרוב מדי לרקע ({report.accentOnSurface.toFixed(1)}:1). כפתורים ואייקונים יבלטו פחות — שווה לבחור גוון {preset.mode === "dark" ? "בהיר" : "כהה"} יותר.
          </span>
        </div>
      )}
    </div>
  );
}
