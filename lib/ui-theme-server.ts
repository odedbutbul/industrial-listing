import { cookies } from "next/headers";
import { parseUiTheme, UI_THEME_COOKIE, type UiTheme } from "@/lib/ui-theme";

/** ערכת הממשק שנבחרה, מתוך העוגייה — כדי שהעמוד ירונדר בצבעים הנכונים בלי הבהוב. */
export async function getUiTheme(): Promise<UiTheme> {
  const jar = await cookies();
  return parseUiTheme(jar.get(UI_THEME_COOKIE)?.value);
}
