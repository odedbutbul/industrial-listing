# PROGRESS — סנכרון מלאי eBay ↔ WooCommerce

**סטטוס כללי:** 🟡 בתהליך · **branch:** `sync` · **נקודת חזרה:** tag `pre-sync-baseline`

סטטוסים: ⏳ ממתין · 🔨 בתהליך · ✅ הושלם · ❌ נכשל · ⏸️ חסום בהחלטה

---

## שלבים

| # | שלב | סטטוס | תאריך | הערות / אימות |
|---|-----|-------|-------|---------------|
| 0 | סריקה + דוח + תוכנית | ✅ | 29/09/2026 | אושר ע"י עודד |
| 1 | tag + branch `sync` + CLAUDE.md + PROGRESS.md | ✅ | 29/09/2026 | `pre-sync-baseline` → f3b677f |
| 2 | מחיקת מה שלא קשור ל-eBay: פייסבוק, webhook ל-Make, CSV, ZIP תמונות, מחיקת-הכל, PWA artifacts, railway.json | ✅ | 29/09/2026 | `next build` ✓, `tsc --noEmit` ✓, diff של `app/api/ebay` מול baseline = 0 שורות. לא נבדק בדפדפן |
| 3 | Drizzle + סכמה + migrations + Postgres מקומי לפיתוח | ⏳ | | |
| 4 | OAuth eBay → `ebay_tokens` (מוצפן), הגדרות מ-env, `lib/ebay/auth.ts` עם refresh | ⏳ | | |
| 5 | משיכת מוצרים מ-eBay → Postgres (תיקון SKU + כמות), קריאה בלבד מול eBay | ⏳ | | |
| 6 | הסרת Supabase (supabase-js, lib/supabase.ts, תלויות) | ⏳ | | build בלי משתני Supabase |
| 7 | UI חדש לפי `shape-design`: login, dashboard, מוצר, לוג, הגדרות | ⏳ | | מסך-מסך, כהה+בהיר, 375px |
| 8 | יצירת מוצרים ב-WooCommerce (טיוטות, הפעלה ידנית) | ⏸️ | | החלטה ב׳ |
| 9 | קליטת הזמנות ל-ledger (webhook Woo + polling eBay) — מצב צפייה בלבד | ⏳ | | |
| 10 | דחיפת כמויות בין הערוצים (`SYNC_PUSH_ENABLED`) | ⏸️ | | החלטה ג׳ |
| 11 | job התאמה תקופתי | ⏳ | | |
| 12 | דיפלוי xCloud + Cron + RuName חדש + OAuth מחדש + ריצה במקביל | ⏸️ | | החלטות א׳, ד׳ |
| 13 | export גיבוי Supabase, כיבוי Render + Supabase | ⏳ | | רק אחרי 12 יציב |

---

## ❓ החלטות פתוחות (לא מכריעים בלי עודד)

**א. איפה Postgres** — נדרש לפני שלב 12 (פיתוח על Postgres מקומי).
- התקנה ידנית על shape-projects: localhost, בלי עלות; התקנה/עדכונים/גיבוי `pg_dump` באחריותנו, חולק משאבים. לא נבדק אם גיבויי xCloud כוללים אותו.
- שרת Docker נפרד ב-xCloud (one-click דורש docker_nginx): מבודד + גיבויים מנוהלים; עלות נוספת, חיבור ברשת (firewall + SSL), רכיב נוסף שיכול ליפול.

**ב. חנות WooCommerce** — נדרש לפני שלב 8.
- קיימת: התאמה לפי SKU + דוח dry-run למניעת כפילויות, בדיקת תוספי מלאי מתנגשים, ניהול מלאי מופעל בכל מוצר.
- חדשה: יצירה נקייה 1:1; תשלומים/משלוחים/SEO מאפס. לא ידוע איפה תתארח.

**ג. מה אוטומטי ב-eBay** — נדרש לפני שלב 10. הצעה:
- אוטומטי: עדכון כמות בלבד בשני הכיוונים, החזרת כמות בביטול, חידוש טוקן, תיקון כמות *כלפי מטה* מה-reconcile.
- ידני (כפתור): יצירת מוצרים בווקומרס, שינוי כותרת/מחיר/תיאור ב-eBay, סגירה/פרסום מחדש, תיקון כמות כלפי מעלה, מחיקות.
- לבדוק לפני הפעלה: האם Out-of-stock control מופעל בחשבון eBay. בלעדיו כמות 0 סוגרת את המודעה וביטול דורש relist ידני (לפי תיעוד eBay, לא נבדק).

**ד. OAuth callback בדומיין החדש** — נדרש לפני שלב 12.
- eBay Developer → User Tokens: מומלץ RuName **חדש** עם Auth accepted URL `https://<דומיין>/api/ebay/oauth/callback` (+ declined + privacy). עריכת הקיים שוברת את Render מיד. RuName נפרד ל-sandbox ול-production.
- קוד: להסיר את כתובת ה-onrender הקשיחה (`app/api/ebay/oauth/callback/route.ts:15`), `EBAY_RUNAME` מ-env, `PUBLIC_PATHS` ב-middleware כולל callback / notifications / woo webhook. אחרי הדיפלוי — להתחבר מחדש.

---

## ⚠️ בעיות ידועות (מהסריקה, 29/09/2026 — יטופלו בשלבים)

- `app/api/ebay/oauth/refresh/route.ts` הוא עותק של listing (AddItem/Revise/End), לא endpoint חידוש. כפתור "חדש Token" בהגדרות מקבל 400.
- `components/ProductForm.tsx` מריץ ReviseItem ב-eBay אוטומטית בכל שמירה של מוצר שפורסם — מנוגד לכלל "רק דרך כפתור". **נשמר** (הוראת עודד: לא למחוק חיבורי eBay) — לשאול את עודד לפני שלב 10 אם להפוך אותו לכפתור.
- `/api/ebay/notifications` חסום ע"י `middleware.ts:4` (לא ב-PUBLIC_PATHS), וה-challenge לא מחושב כנדרש.
- `app/api/ebay/sync/route.ts` לא מחדש טוקן, לא שומר SKU, וכמות עלולה לכלול יחידות שנמכרו.
- `next.config.mjs` ריק — הטענה ביומן הישן ש-standalone מוכן לא נכונה.
- `GET /api/settings` מחזיר טוקנים וסודות לדפדפן. (`DELETE /api/products` — מחיקת הכל — הוסר בשלב 2.)
- CLAUDE.md הישן (בהיסטוריית git) הכיל כתובת Supabase ו-anon key. הוסרו מהגרסה הנוכחית; נשארים בהיסטוריה עד שיכובה Supabase.

## 📝 החלטות שהתקבלו

- 29/09/2026 — Postgres + Drizzle במקום Supabase; xCloud (shape-projects) במקום Render; Cron של השרת.
- 29/09/2026 — polling ל-Fulfillment API כבסיס; webhooks של eBay בהמשך.
- 29/09/2026 — לא מעבירים נתונים מ-Supabase: מושכים מחדש מ-eBay, והטוקנים מתקבלים בהתחברות מחדש.
- 29/09/2026 — UI לפי הסקיל `shape-design` (ייחוס: `~/Projects/flowbot-license`).
- 29/09/2026 — **לא מוחקים שום חיבור קיים ל-eBay** (הוראת עודד): כל `app/api/ebay/*` (OAuth, sync, listing, notifications, diagnose, refresh), דף המוצר עם כפתורי eBay, `ProductForm`, `/products/new`, `SyncModal`, והגדרות eBay (כולל Business Policies ו-Cloudinary) נשארים. התאמה מותרת; מחיקה — רק באישור מפורש.
- 29/09/2026 — קבצי next-pwa שנוצרים ב-build (`sw.js`, `workbox-*`, `swe-worker-*`) הוצאו מ-git ונוספו ל-`.gitignore`.
