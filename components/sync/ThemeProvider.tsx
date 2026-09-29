"use client";

import "./app-ui.css";
import { createContext, useContext, useMemo, useState } from "react";
import {
  getPreset,
  serializeUiTheme,
  uiThemeVars,
  UI_THEME_COOKIE,
  type UiTheme,
} from "@/lib/ui-theme";

interface Ctx {
  theme: UiTheme;
  setTheme: (t: UiTheme) => void;
}

const ThemeCtx = createContext<Ctx | null>(null);

export function useUiTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useUiTheme מחוץ ל-ThemeProvider");
  return c;
}

/** עוטף את מסכי הניהול: משטחי הערכה (data-theme) + משתני המבטא המחושבים (style). */
export function ThemeProvider({ initial, children }: { initial: UiTheme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>(initial);

  const ctx = useMemo<Ctx>(
    () => ({
      theme,
      setTheme(t) {
        setThemeState(t);
        // שנה — העדפת תצוגה בלבד, לא מידע רגיש.
        document.cookie = `${UI_THEME_COOKIE}=${encodeURIComponent(serializeUiTheme(t))}; path=/; max-age=31536000; samesite=lax`;
      },
    }),
    [theme],
  );

  const preset = getPreset(theme.preset);
  return (
    <ThemeCtx.Provider value={ctx}>
      <div
        className="app-ui"
        data-theme={preset.id}
        data-mode={preset.mode}
        dir="rtl"
        style={uiThemeVars(theme) as React.CSSProperties}
      >
        {children}
      </div>
    </ThemeCtx.Provider>
  );
}
