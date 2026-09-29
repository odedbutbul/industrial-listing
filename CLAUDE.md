# סנכרון מלאי eBay ↔ WooCommerce — CLAUDE.md

> הפרויקט שינה ייעוד ב-29/09/2026. בעבר: Industrial Listing Tool (פרסום ציוד ל-eBay ופייסבוק).
> עכשיו: מערכת סנכרון מלאי דו-צדדית בין חשבון eBay של הלקוחה (vizvik16) לחנות WooCommerce.
> נקודת החזרה לגרסה הישנה: tag `pre-sync-baseline` (= main לפני השינוי).

---

## 🤖 הוראות לקלוד קוד — חובה

1. **לפני כל משימה** קרא את `PROGRESS.md` — שם הסטטוס, השלב הנוכחי וההחלטות הפתוחות.
2. **אחרי כל שלב** עדכן את `PROGRESS.md` (סטטוס, תאריך DD/MM/YYYY, מה נעשה, איך אומת).
3. **עבודה רק על branch `sync`.** main נשאר נקודת חזרה ולא נוגעים בו עד שהמערכת עובדת.
4. **כל טענה ש"עובד" חייבת מדידה** (build, בדיקה, קריאה בפועל). מה שלא נבדק מסומן "לא נבדק".
5. **סודות:** לעולם לא להעתיק ערכים מ-`.env*` לקוד, לתיעוד, ללוגים או לריפו. רק שמות משתנים.
6. **החלטות פתוחות** (רשימה ב-PROGRESS.md) — לא מכריעים בהן לבד. שואלים את עודד.
7. **UI:** כל מסך נבנה לפי הסקיל `shape-design` (ראה סעיף עיצוב). אין להמציא שפה חזותית.
8. **לא מוחקים חיבורים קיימים ל-eBay** (`app/api/ebay/*` וה-UI שמפעיל אותם). מותר להתאים; מחיקה רק באישור מפורש של עודד.

---

## מה המערכת עושה

- מושכת את המוצרים מחשבון eBay ויוצרת אותם ב-WooCommerce דרך ה-REST API של ווקומרס.
- מכירה באתר → הכמות ב-eBay יורדת מיד. ביטול הזמנה באתר → הכמות חוזרת.
- מכירה ב-eBay → המלאי באתר יורד.
- **מקור האמת למלאי:** טבלת `stock_ledger` — כל שינוי נרשם (ערוץ, כמות, זמן, הזמנה). מלאי זמין = `SUM(delta)`.
- **הדרישה הקריטית:** רוב הפריטים הם יחידה אחת — מניעת מכירה כפולה קודמת לכל דבר.
- job התאמה תקופתי מול שני הצדדים, ולוג (`sync_log`) לכל פעולת סנכרון.

### מנגנוני קליטת מכירות
- **eBay:** polling ל-Fulfillment API (`getOrders` לפי lastmodifieddate) כל כמה דקות — מנגנון הבסיס. webhooks של eBay — שכבה נוספת בהמשך.
- **WooCommerce:** webhook על הזמנה (אימות חתימת HMAC). הכמות ב-eBay יורדת מיד; חוזרת אם ההזמנה בוטלה.

### כללי בטיחות בסנכרון
- כל הזמנה נרשמת בטרנזקציה אחת: `processed_orders` (אינדקס ייחודי = אידמפוטנטיות) → נעילת שורת המוצר (`FOR UPDATE`) → רשומת ledger → `pending_pushes` לערוץ השני.
- דחיפה שנכשלה נשלחת שוב ע"י cron. לעולם לא "לבלוע" כשל — הוא נרשם ב-`sync_log`.
- מתג כיבוי כללי `SYNC_PUSH_ENABLED` + `sync_enabled` לכל מוצר.
- jobs רצים עם `pg_try_advisory_lock` — אף פעם לא שתי ריצות במקביל.
- **שום פעולה ב-eBay לא קורית אוטומטית אלא אם הוחלט במפורש** (ראה החלטות פתוחות ב-PROGRESS.md).

---

## סטאק

| שכבה | בחירה |
|---|---|
| אפליקציה | Next.js 14 (App Router), TypeScript |
| DB | Postgres + Drizzle ORM (במקום Supabase) |
| eBay | OAuth (authorization code + refresh), Trading API (GetMyeBaySelling, GetItem, ReviseInventoryStatus), Fulfillment API (getOrders) |
| WooCommerce | REST API v3 (consumer key/secret) + webhooks |
| אירוח | xCloud, שרת shape-projects (Node 24, nginx רגיל), דיפלוי מ-Git |
| תזמון | Cron של השרת (לא WP-Cron) שמריץ סקריפטים ב-`jobs/` |
| הזדהות | כניסת מנהל יחיד (cookie) — `middleware.ts` + `app/api/auth/*` |

Render ו-Supabase יכובו רק אחרי שהמערכת החדשה רצה בייצור (ואחרי export גיבוי של Supabase).

---

## מבנה תיקיות (יעד)

```
app/                 dashboard · products/[id] · logs · settings · login
app/api/             auth/* · ebay/oauth/{authorize,callback} · ebay/notifications · woo/webhook
lib/db/              schema.ts · client.ts · migrations/
lib/ebay/            auth.ts · trading.ts · fulfillment.ts
lib/woo/             client.ts · products.ts · orders.ts · verify-webhook.ts
lib/sync/            ledger.ts · apply-order.ts · push.ts · import.ts · reconcile.ts · log.ts
jobs/                poll-ebay-orders.ts · push-pending.ts · reconcile.ts · refresh-token.ts
drizzle.config.ts
```

## סכמת DB (יעד)

| טבלה | תפקיד |
|---|---|
| `ebay_tokens` | access/refresh token מוצפנים + תוקף + scopes |
| `products` | נתוני המוצר (כותרת, תיאור, מצב, מחיר, תמונות, קטגוריית eBay) |
| `channel_mappings` | SKU ↔ ebay_item_id ↔ woo_product_id (כולם ייחודיים), sync_enabled, כמויות אחרונות ידועות |
| `stock_ledger` | delta, channel, reason, external_order_id/line_id, idempotency_key ייחודי |
| `processed_orders` | הזמנות שעובדו, ייחודי על (channel, order, line) |
| `pending_pushes` | עדכוני כמות שממתינים/נכשלו + ניסיונות חוזרים |
| `sync_cursors` | מיקום ה-polling (למשל lastModified של הזמנות eBay) |
| `sync_log` | לוג לכל פעולה: job, כיוון, פעולה, תוצאה, שגיאה, משך |

---

## 🎨 עיצוב — לפי הסקיל `shape-design`

- **חובה לטעון את הסקיל `shape-design` לפני כל עבודת UI.** אפליקציית הייחוס: `~/Projects/flowbot-license`.
- מעתיקים את `base.css`, `tokens.css`/`theme.ts`, `ui.tsx`, `tables.ts` מהסקיל — לא ממציאים.
- הכלל: *שומרים את הצבעים, לוקחים את כל השאר*. פלטה: ברירת המחדל של הסקיל (teal כהה / sunrise בהיר) — אלא אם עודד יגדיר אחרת.
- Heebo / Rubik / JetBrains Mono (מספרים, SKU, מזהי הזמנות), אייקונים Phosphor, RTL, כהה כברירת מחדל + בהיר.
- מובייל ≤860px: tab bar תחתון (עד 4), דיאלוגים כ-bottom sheet, טבלאות הופכות לכרטיסים.
- נגישות IS 5568 / WCAG AA. מצבי טעינה, ריק ושגיאה לכל מסך.
- ה-UI הקיים (Tailwind + shadcn, כתום #f97316) הוא מהפרויקט הקודם — יוחלף מסך-מסך.

---

## משתני סביבה (שמות בלבד)

- **אפליקציה:** `APP_BASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`
- **DB:** `DATABASE_URL`
- **eBay:** `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_RUNAME`, `EBAY_SANDBOX`, `TOKEN_ENCRYPTION_KEY`; בהמשך `EBAY_NOTIFICATION_VERIFICATION_TOKEN`
- **WooCommerce:** `WC_BASE_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`, `WC_WEBHOOK_SECRET`
- **סנכרון:** `CRON_SECRET`, `SYNC_PUSH_ENABLED`
- **מתבטלים:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_URL`, `EBAY_USER_TOKEN`, `EBAY_DEV_ID`, `CLOUDINARY_*`, `NEXT_PUBLIC_BASE_URL` (→ `APP_BASE_URL`)

`.env.local` נמצא ב-`.gitignore` ואסור שיעלה לריפו.

---

## הערות טכניות מהפרויקט הקודם שעדיין רלוונטיות
- `.bin/next` שבור ב-Node 25 מקומית — מריצים `node node_modules/next/dist/bin/next`.
- listings קיימים ב-eBay נוצרו דרך Trading API — עדכון כמות צריך `ReviseInventoryStatus`, לא Inventory API (לפי תיעוד eBay, לא נבדק בחשבון).
- כמות זמינה מ-GetItem = `Quantity − SellingStatus.QuantitySold` (לפי תיעוד eBay, לא נבדק).
