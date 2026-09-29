# אפיון מבנה האתר — חנות ציוד טכני ותעשייתי (שלב 1)

> **גרסה:** 1.1 · 29/09/2026 — נוספה שפת הרכיבים של הבית (ax-*)
> **מיועד ל:** Claude Design (עיצוב מסכים) ולסוכן שבונה את ה-theme בקוד.
> **שם המותג טרם נקבע.** בכל מקום כתוב `[BRAND]` ובמקום הלוגו — placeholder. לא להמציא שם.
> **כל הטקסטים שמופיעים באתר — באנגלית.** ההסברים במסמך בעברית.

---

## 0. תקציר בשלוש שורות

חנות אונליין בינלאומית לחלקים טכניים שקשה למצוא: אוטומציה תעשייתית, מנועים, חיישנים, ספקי כוח, ציוד מעבדה, לייזרים ואופטיקה, Vacuum, רובוטיקה ואלקטרוניקה. חדש, surplus ומשומש.
הלקוח מגיע עם **מספר חלק (Part Number)** ורוצה לדעת תוך שניות: **יש? באיזה מצב? כמה עולה? מתי יגיע?**
לכן האתר בנוי סביב **חיפוש**, **עמוד מוצר אמין** ומסלול חלופי כשאין: **Request a Part**.

---

## 1. עובדות שהעיצוב חייב לכבד

| עובדה | מה זה אומר לעיצוב |
|---|---|
| כל המוצרים מגיעים מ-eBay דרך מערכת סנכרון (כ-6,600 מוצרים) | אין עריכה ידנית של מוצר באתר. העיצוב משתמש רק בשדות שקיימים (סעיף 3) |
| **רוב הפריטים הם יחידה אחת** | מצב "Sold" ו-"Only 1 left" הם מצבים רגילים, לא חריגים. חייבים להיראות טוב |
| המלאי מתעדכן כל כמה דקות | אין הבטחות כמו "Reserved for you". אין countdowns |
| סליקה: **PayPal בלבד** | הקופה פשוטה: כתובת ← משלוח ← כפתורי PayPal. בלי טופס כרטיס אשראי |
| קהל בינלאומי, **אנגלית, USD, LTR** | אין RTL באתר. אין בורר שפה בשלב 1 |
| המחיר זהה ל-eBay | לא להציג "Cheaper than eBay" או השוואות מחיר |
| לא מפנים לקוחות מ-eBay לאתר | באתר מותר להזכיר את היסטוריית המכירות, **בלי לוגו של eBay** ובלי לינק לחנות eBay |
| WordPress + WooCommerce, theme בקוד (בלי Elementor) | כל עמוד צריך להיות ממופה לתבנית WooCommerce (סעיף 2). לא לעצב אינטראקציות שדורשות אפליקציה נפרדת |
| הנתונים של "13K+ sales", "100% positive", "since 2013" **לא אומתו** | בעיצוב — placeholder מסומן `{{verify}}`. לא עולה לאוויר בלי אימות |

---

## 2. מפת האתר (Sitemap) — שלב 1

| # | עמוד | URL | תבנית WooCommerce / WP |
|---|---|---|---|
| 1 | Home | `/` | `front-page.php` |
| 2 | All products (Shop) | `/shop/` | `archive-product.php` |
| 3 | Category | `/category/{slug}/` (+ תת-קטגוריה) | `taxonomy-product_cat.php` |
| 4 | Brand | `/brand/{slug}/` | taxonomy `product_brand` |
| 5 | All brands (A–Z) | `/brands/` | page template |
| 6 | Search results | `/?s=…&post_type=product` | `search.php` / archive |
| 7 | **Product** | `/product/{brand}-{part-number}/` | `single-product.php` |
| 8 | **Request a Part** | `/request-a-part/` | page template + form |
| 9 | Cart | `/cart/` | WooCommerce cart |
| 10 | Checkout | `/checkout/` | WooCommerce checkout |
| 11 | Order received | `/checkout/order-received/…` | thank-you |
| 12 | My account (הזמנות, כתובות, פרטים) | `/my-account/` | WooCommerce account |
| 13 | About | `/about/` | page |
| 14 | Contact | `/contact/` | page + form |
| 15 | Shipping | `/shipping/` | page |
| 16 | Returns & Warranty | `/returns/` | page |
| 17 | Condition guide | `/condition-guide/` | page |
| 18 | FAQ | `/faq/` | page |
| 19 | Terms, Privacy, Cookies | `/terms/` `/privacy/` `/cookies/` | page |
| 20 | 404 | — | `404.php` |

**לא בשלב 1 (לא לעצב עכשיו, אבל להשאיר מקום בתפריט/פוטר אם נוח):** Request a Quote לכמויות, Bulk RFQ (העלאת רשימת חלקים), חשבון B2B, Technical Knowledge Center, Sell Your Surplus.

---

## 3. הנתונים שיש לכל מוצר (מה מותר לעצב)

| שדה | מקור | תמיד קיים? | הערה |
|---|---|---|---|
| Title | כותרת המודעה ב-eBay | ✅ | ארוכה (עד 80 תווים), לפעמים עמוסה. **לא** לשמש ככותרת הראשית אם יש Brand+MPN |
| Brand (יצרן) | Item Specifics ב-eBay | ⚠️ לא ידוע כמה | אם חסר — מציגים את ה-Title בלבד |
| Part Number (MPN) | Item Specifics | ⚠️ לא ידוע כמה | כנ"ל |
| SKU פנימי | eBay SKU | ✅ | מוצג קטן, ב-`mono` |
| Price | eBay | ✅ | USD |
| Quantity | מערכת הסנכרון | ✅ | ברוב המקרים 1 |
| Condition | eBay (רשימה סגורה, ראה סעיף 5) | ✅ | |
| Condition notes | טקסט חופשי של המוכר על המצב | ⚠️ חלקי | "Tested, working, minor scratches" |
| Images | eBay | ✅ לפחות אחת | תמונות אמיתיות של הפריט, רקעים לא אחידים, לא בהכרח מרובעות |
| Item specifics | eBay | ⚠️ חלקי | טבלת מפרט (Voltage, Series, Model…) |
| Description | eBay (HTML, ינוקה) | ✅ | אורך משתנה מאוד |
| Category | מיפוי מקטגוריית eBay | ✅ | 10 קטגוריות ראשיות (סעיף 4) |
| Weight / dimensions | eBay | ⚠️ חלקי | לחישוב משלוח |

> **כלל עיצובי:** כל רכיב חייב להיראות טוב גם כשהשדה חסר. לעצב כל כרטיס מוצר ועמוד מוצר בשתי גרסאות: **עם** Brand+MPN, ו**בלי** (רק Title).

---

## 4. קטגוריות ראשיות (הצעה — המיפוי מ-eBay עוד לא נעשה)

| Category | תת-קטגוריות לדוגמה | אייקון (lucide, קו דק) |
|---|---|---|
| Industrial Automation | PLC · HMI · I/O Modules · Drives · Servo | `cpu` |
| Motors & Motion | Servo Motors · Stepper · Actuators · Gearboxes | `rotate-cw` |
| Sensors & Control | Sensors · Relays · Switches · Controllers | `radar` |
| Power | Power Supplies · Transformers · UPS · Modules | `zap` |
| Laboratory Equipment | Measurement · Analytical · Scientific | `flask-conical` |
| Lasers & Optics | Lasers · Optics · Photonics | `scan-line` |
| Vacuum Technology | Pumps · Valves · Gauges · Controllers | `gauge` |
| Medical & Aesthetic | Aesthetic Lasers · Medical Components | `stethoscope` |
| Robotics & Semiconductor | End Effectors · Wafer Handling · Robot Parts | `bot` |
| Electronics | Boards · Communication · Components | `circuit-board` |

כל קטגוריה מציגה ספירת מוצרים (`1,240 items`) — נמשכת אוטומטית.

---

## 5. מערכת מצב המוצר (Condition) — רכיב מרכזי

eBay מאפשר רשימה סגורה. באתר נציג אותה כ**תג (pill) בזוג גוונים** — טקסט צבעוני על רקע בהיר מאותו גוון, עם נקודה — + שם + שורת הסבר קצרה. **אף פעם לא בלוק צבע מלא, ותמיד טקסט + צבע, לא רק צבע** (נגישות). אותו מצב = אותו גוון בכל האתר (טבלת מיפוי אחת).

| Badge באתר | מ-eBay | גוון (tone) | שורת הסבר |
|---|---|---|---|
| **New** | New / Brand New | `ok` (ירוק) | Factory new, original packaging |
| **New – Open Box** | New other / Open box | `accent` | Unused, packaging opened or missing |
| **Refurbished** | Certified / Seller refurbished | `blue` | Restored to working condition |
| **Used** | Used / Pre-owned | `warn` (ענבר) | Previously used. See condition notes and photos |
| **For Parts / Not Working** | For parts or not working | `bad` (אדום) | Sold as-is for parts or repair |
| **Sold** (מצב מלאי, לא מצב מוצר) | כמות 0 | `gray` | — |

- "Used – Tested" / "Used – Untested" **לא קיימים כשדה**. אם בהערות המצב כתוב "tested" — מוצג בתוך ה-Condition notes, לא כ-badge נפרד.
- ליד ה-badge בעמוד מוצר: לינק `What does this mean?` → `/condition-guide/`.

---

## 6. כיוון עיצובי

### 6.1 אופי
מקצועי, טכני, אמין, מהיר. **Modern industrial technology** — לא "מחסן חלקים 2008" ולא "חנות גאדג'טים".
השראה: שפת הבית (`ax-*`) — **רגוע, צפוף אבל נושם, מבטא אחד שמדבר**. ניקיון של Stripe / Linear + צפיפות מידע של קטלוג B2B. הרבה white space סביב, כרטיסים ורשימות צפופים ויעילים בפנים.

### 6.2 צבעים (הצעה, עד שייקבע מותג)
| טוקן | ערך | שימוש |
|---|---|---|
| `--ink` | `#0B1220` | טקסט ראשי, header כהה, footer |
| `--graphite` | `#151E2D` | משטחים כהים, hero |
| `--accent` | `#246BFD` | CTA, לינקים, focus |
| `--surface` | `#F5F7FA` | רקע סקשנים |
| `--white` | `#FFFFFF` | כרטיסים |
| `--line` | `#E3E8EF` | קווים |
| `--muted` | `#5B6475` | טקסט משני (לוודא ניגודיות 4.5:1) |
| סטטוס | ירוק / כחול / ענבר / אדום | רק ל-Condition ולמלאי |

אקסנט אחד בלבד. אין גרדיאנטים צבעוניים. כל הצבעים כמשתני CSS כדי שיהיה קל להחליף כשייקבע מותג.

> **הצבעים — של החנות. כל השאר — משפת העיצוב של הבית** (סעיף 6.3 ואילך ו-7.0): צורות, גדלים, ריווח, טיפוגרפיה, התנהגות רכיבים. הרפרנס החי: מערכת `ax-*` של quotes-app. **"שומרים את הצבעים, לוקחים את כל השאר."**

### 6.3 טיפוגרפיה (שפת הבית)
שלושה פונטים בלבד, **מתארחים מקומית** (woff2, בלי Google Fonts/CDN):

| תפקיד | פונט | מידה |
|---|---|---|
| כותרות | **Rubik** 600, ריווח אותיות `-0.02em` | H1 עמוד פנימי: `clamp(24px, 3vw, 30px)` · H1 הירו/מוצר: `clamp(30px, 4vw, 44px)` · H2 סקשן: 22–24px · H2 כרטיס: 17px · כותרת דיאלוג: 18px |
| גוף | **Heebo** | 15–16px / 1.5 בחנות (במסכי ניהול 14px — בחנות מגדילים לקריאות) |
| מספרים ומזהים | **JetBrains Mono**, `tabular-nums` | Part numbers, SKU, מחירים, מספרי הזמנה, כמויות, תאריכים |

- **סימן היכר: מספר חלק תמיד במונו.** מחיר ראשי בעמוד מוצר: מונו 28–32px / 600 / `-0.03em` (כמו ערך KPI).
- תווית שדה: 13px / 500, צבע טקסט משני. רמז מתחת לשדה: 12.5px, מושתק. כותרת עמודה בטבלה: 12px / 500, מושתק.
- **כל כותרת עמוד = H1 + שורת משנה אחת** שאומרת את **המצב**, לא את שם העמוד ("230 parts in stock · updated every few minutes", לא "This is the PLC category").

### 6.4 צורות, גדלים ומרווחים (שפת הבית — לא ממציאים ערכים חדשים)

**רדיוסים — רק אלה:**
| רדיוס | שימוש |
|---|---|
| **999px (pill)** | כל הכפתורים, תגים (Condition/Stock), שורת החיפוש, צ'יפים של פילטרים, מתג grid/list, toast |
| 22px | דיאלוג / lightbox / bottom sheet |
| 20px | כרטיס (סקשן, תיבת קנייה, טופס, סיכום הזמנה) |
| 16–18px | כרטיס מוצר, כרטיס במובייל, תפריט נפתח, mega menu, typeahead |
| 14px | משטח פנימי בתוך כרטיס (`inner`) — למשל תיבת Buy with confidence, מסגרת התמונה |
| 12px | שדות קלט, התראות, אריח אייקון, כפתור אייקון, פריט ניווט |
| 10px | פריט בתוך תפריט, thumbnail בגלריה |

**גבהים (גם יעדי מגע):** כפתור ושדה **44px** · כפתור קטן 36px · תג 24px · כפתור ב-segmented 32px · שורת חיפוש בהירו 56–64px (עדיין pill).

**מסגרות:** מסגרת של כרטיס/שדה = **טבעת פנימית עדינה (`box-shadow: inset 0 0 0 1px`)**, לא `border`. `border` רק לקווי הפרדה בין שורות. צל רך וגדול רק בריחוף על כרטיס מוצר ובשכבות צפות.

**משטחים:** כרטיסים בתחושת **זכוכית** (רקע חצי-שקוף + `backdrop-filter: blur(22px) saturate(140%)`) מעל רקע הסקשן. דיאלוגים, תפריטים ו-typeahead — **תמיד אטומים**.

**ריווח:** בין סקשנים בעמוד 24px (בדף הבית בין סקשנים גדולים: 64–96px) · ריפוד כרטיס `clamp(18px, 3vw, 28px)` · ראש כרטיס `16px 20px` · רוחב תוכן מקסימלי **1320px**; עמודי טקסט/טפסים **820px**.

**אייקונים:** lucide בלבד, קו 1.5–2px, 18–20px. בתוך כרטיס/אריח: **אריח אייקון** (ריבוע 12px-radius עם גוון המבטא הבהיר והאייקון במבטא). **בלי גלגלי שיניים** (קלישאה).

**תמונות מוצר:** בתוך משטח פנימי (14px) בצבע רקע בהיר אחיד, `object-fit: contain`, יחס 1:1 — כי התמונות מ-eBay לא אחידות. בגלל שהתמונות לא בשליטתנו, **המסגרת היא שמייצרת את הסדר**.

**איפה המבטא מופיע — ורק שם:** כפתור ראשי (עם glow עדין), פריט ניווט/סינון פעיל, טבעות focus, לינקים, אייקונים באריחים, פס התקדמות. **לא** לרקעי סקשנים, לא לכותרות, לא לתגים של מצב.

> **הרחבות לחנות — ממתינות לאישור עודד.** מערכת הבית נבנתה למסכי ניהול. לחנות ציבורית הוספו חמישה ערכים שלא קיימים בה: H1 הירו/מוצר `clamp(30px, 4vw, 44px)`, H2 סקשן 22–24px, גוף 15–16px (במקום 14), מרווח 64–96px בין סקשנים בדף הבית, ושורת חיפוש בהירו 56–64px. כל שאר הערכים — כמו בבית.

### 6.4א התנהגות (שפת הבית)
- **כפתור ראשי אחד לכל אזור.** בעמוד מוצר: Add to cart. בטופס: Send. השאר משניים/שקטים.
- סוגי כפתורים: **Primary** (מבטא + glow) · **Secondary** (שקוף עם טבעת) · **Ghost** (בלי רקע — ביטול, פעולות בשורה) · **Link** (נראה כקישור במבטא) · **Icon** (עגול/12px, תמיד עם `aria-label`). כפתור PayPal — הכפתור הרשמי של PayPal (יוצא מן הכלל היחיד).
- בזמן פעולה: הכפתור `disabled` (שקיפות 0.55) + ספינר קטן בתוכו. **אין ספינר על כל העמוד** — טעינה = **skeleton** בצורת מה שיגיע.
- **פוקוס:** טבעת 2px במבטא בכל אלמנט; בשדות — טבעת פנימית 2px.
- **סינון = segmented pills עם מונים** (`All 230 · New 41 · Used 170 · For parts 19`), לא dropdown.
- **כל רשימה = טבלה בדסקטופ וכרטיסים במובייל, מאותם נתונים** (≤860px). חל על: תוצאות חיפוש בתצוגת list, הזמנות בחשבון, שורות בעגלה.
- **מפרט = שורות key–value** (תווית מושתקת משמאל, ערך מימין, קו מפריד דק, בלי קו בשורה האחרונה) — לא טבלת HTML עם רקעים מתחלפים.
- **הודעות:** התראה בתוך העמוד (12px, אייקון בתחילת השורה, גוון ok/warn/bad), toast קצר (3 שניות, pill, תחתית המסך) לפעולות כמו "Added to cart", "Part number copied".
- **שכבות צפות** (lightbox, bottom sheet, mega menu): Esc ולחיצה מחוץ סוגרים. דיאלוג = כותרת / תוכן / שורת כפתורים.
- **מצב ריק** = כרטיס עם אריח אייקון גדול, כותרת, משפט אחד על מה קורה עכשיו, **פעולה אחת**. **מצב שגיאה** = התראה אדומה + "Try again". **מסונן לכלום** = הערה קצרה + "Clear filters".
- `prefers-reduced-motion` מבטל אנימציות (מגירה, קרוסלה, hover-lift).

### 6.5 רספונסיביות
נקודות השבירה של הבית: **≥640** טפסים עוברים לשתי עמודות · **≤860** טבלאות → כרטיסים · **≤900** תפריט ראשי → מגירה + כפתור תפריט. לבדוק ב-1320, 1024, 768, 375. מובייל-first בבדיקה: **רוב התנועה מגוגל תגיע ישר לעמוד מוצר בטלפון.**

### 6.6 נגישות ו-SEO (חובה בעיצוב)
- WCAG 2.1 AA: ניגודיות 4.5:1 (גם לטקסט על המבטא), focus גלוי, יעדי לחיצה 44px, כל כפתור אייקון עם `aria-label`, `<label>` לכל שדה, `role="status"` להצלחה ו-`role="alert"` לשגיאה, שדות מובייל 16px (בלי zoom ב-iOS).
- H1 אחד בכל עמוד. Breadcrumbs בכל עמוד מלבד הבית.

---

## 7. רכיבים גלובליים

### 7.1 Header (דסקטופ)
```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar (graphite, 32px): 🌍 Worldwide shipping from Israel · Secure │
│ PayPal checkout · Need help? contact@…                                │
├──────────────────────────────────────────────────────────────────────┤
│ [LOGO]  [ 🔍 Search part number, brand or keyword…        ] [Search] │
│                                         Request a Part   👤  🛒 (2)  │
├──────────────────────────────────────────────────────────────────────┤
│ Categories ▾   Brands ▾   New Arrivals   Condition Guide   Contact   │
└──────────────────────────────────────────────────────────────────────┘
```
- **שורת החיפוש היא הרכיב הכי בולט ב-header** (רוחב ~50%, pill בגובה 44px, אייקון חיפוש בתחילתה, קיצור `/` מוצג בסופה). כפתור Search = primary pill.
- Account ו-Cart = כפתורי אייקון 44px עם `aria-label`; מונה העגלה = תג עגול קטן במבטא.
- Request a Part = כפתור secondary pill (טבעת), לא לינק.
- פריט תפריט פעיל (`aria-current="page"`): גוון מבטא בהיר + טבעת, לא קו תחתון.
- Sticky: בגלילה נשארת שורה אחת — לוגו + חיפוש + עגלה.
- **Categories ▾** — mega menu: 10 קטגוריות ב-2 עמודות עם אייקון + 3–4 תת-קטגוריות לכל אחת + "View all". לא יותר.
- **Brands ▾** — 15 מותגים פופולריים (טקסט, לא לוגואים — אין לנו זכות להשתמש בלוגואים) + "All brands A–Z →".

### 7.2 Header (מובייל)
```
[☰]   [LOGO]            [🔍] [🛒]
[ 🔍 Search part number…           ]   ← תמיד גלוי מתחת ל-header
```
- ☰ פותח **מגירה** משמאל (≤900px, כמו סרגל הצד של הבית): Categories (אקורדיון), Brands, New Arrivals, Request a Part, Account, Contact. פריטי ניווט 44px, radius 12. Esc/לחיצה מחוץ סוגרים.

### 7.3 Search typeahead (הצעות בזמן הקלדה)
נפתח אחרי 2 תווים:
```
┌───────────────────────────────────────────────┐
│ PRODUCTS                                      │
│ [img] SIEMENS 6ES7 214-1AG40-0XB0   Used  $450│
│ [img] SIEMENS 6ES7 214-1BG40-0XB0   New   $690│
│ BRANDS                                        │
│ Siemens (412 items)                           │
│ CATEGORIES                                    │
│ PLC (230)                                     │
├───────────────────────────────────────────────┤
│ See all 18 results for "6es7 214"  →          │
│ Can't find it? Request this part   →          │
└───────────────────────────────────────────────┘
```
- החיפוש מבין Part Number עם/בלי רווחים ומקפים (`6ES7214-1AG40` = `6es7 214 1ag40`).
- מספר החלק מוצג במונו, עם הדגשת החלק שהוקלד. מצב המוצר כתג pill קטן, מחיר במונו.
- התיבה: אטומה, radius 16–18, צל רך. שורות = פריטי תפריט (radius 10) עם ניווט במקלדת (↑↓ Enter Esc). בזמן טעינה — 3 שורות skeleton.

### 7.4 Footer (graphite כהה)
```
[LOGO]                  Shop              Help                Company
Hard-to-find technical  Categories        Shipping            About
parts, shipped          Brands            Returns & Warranty  Contact
worldwide.              New Arrivals      Condition Guide     Terms
                        Request a Part    FAQ                 Privacy
📍 Israel · ✉ email      
─────────────────────────────────────────────────────────────────────
© 2026 [BRAND] · A brand of YP Tech Solutions {{verify}}    [PayPal]
```

### 7.5 Trust strip (רכיב חוזר)
4 פריטים בשורה (מובייל: 2×2). כל פריט: **אריח אייקון** (12px radius, גוון מבטא בהיר) + כותרת Rubik 15/600 + שורה מושתקת. בלי מסגרות בין הפריטים:
- `package-check` **Real Inventory** — Every item is in our warehouse
- `camera` **Actual Photos** — You get the exact item pictured
- `globe` **Worldwide Shipping** — Tracked delivery from Israel
- `star` **13,000+ Sales** — 100% positive feedback `{{verify}}`

### 7.6 Product card — שתי תצוגות

**Grid (ברירת מחדל בבית ובקטגוריות):** כרטיס זכוכית, radius 16–18, טבעת פנימית עדינה, ריפוד 12px. ריחוף: הרמה קלה + צל רך + טבעת במבטא. כל הכרטיס לחיץ (לינק אחד, לא כפתורים בתוכו).
```
┌──────────────────┐
│   [ image 1:1 ]  │   ← contain, משטח פנימי radius 14
│ (● Used) 1 left  │   ← תג pill מצב + טקסט מלאי קטן
│ SIEMENS          │   ← brand, 12px uppercase, muted
│ 6ES7 214-1AG40   │   ← MPN במונו, 16px bold
│ SIMATIC S7-1200  │   ← שורת title מקוצרת, 2 שורות מקס
│ CPU 1214C…       │
│ $450.00          │   ← מונו 17/600
└──────────────────┘
```
בלי Brand/MPN → Title בשלוש שורות במקום.
**בלי** כפתור Add to cart בכרטיס (יחידה אחת — שהלקוח ייכנס לעמוד ויראה מצב ותמונות).

**List (ברירת מחדל בתוצאות חיפוש, מתג בכל ארכיון):**
```
[img] SIEMENS 6ES7 214-1AG40-0XB0  │ CPU 1214C DC/DC/DC │ [Used] │ 1 in stock │ $450.00 │ [View]
```
טבלה צפופה — זה מה שקונה B2B רוצה כשהוא משווה. **בדסקטופ טבלה** (כותרות עמודה 12/500 מושתק, קווי הפרדה בין שורות, Part number = כותרת השורה במונו, פעולה בסוף השורה ככפתור ghost), **≤860px — אותם נתונים ככרטיסים** (radius 16, תמונה משמאל, מצב + מחיר בשורה התחתונה).

### 7.7 Stock indicator
תג pill עם נקודה, בזוג גוונים (לא בלוק צבע):

| מצב | תצוגה | גוון |
|---|---|---|
| 1 | `● Only 1 in stock` | `ok` |
| 2–9 | `● 4 in stock` (המספר במונו) | `ok` |
| 10+ | `● In stock` | `ok` |
| 0 | `● Sold` — ראו עמוד מוצר במצב Sold | `gray` |

### 7.8 מצבים שחייבים עיצוב בכל עמוד
טעינה (**skeleton** בצורת הכרטיסים/השורות — לא ספינר עמוד), ריק (כרטיס + אריח אייקון + משפט + פעולה אחת), שגיאה (התראה אדומה + Try again), מסונן-לכלום (הערה + Clear filters), ומוצר שנמכר בזמן שהלקוח צפה בו (התראת warn בעגלה).

---

## 8. עמודים — סקשן אחר סקשן

### 8.1 Home `/`

**S1 — Hero (graphite כהה, גובה ~520px דסקטופ, ~440 מובייל)**
- H1: **Hard-to-find parts. Found.**
- משנה: *New, surplus and used industrial, automation, lab and technical equipment — shipped worldwide.*
- **חיפוש גדול** (גובה 64px, רוחב 720px) עם placeholder מתחלף: `6ES7 214-1AG40…` / `ABB ACS355…` / `MKS 979B…`
- מתחת לחיפוש: `Popular:` 5 צ'יפים של מותגים (Siemens · ABB · Fanuc · Lumenis · MKS)
- שורה: *Can't find it?* **Request a part →**
- רקע: טקסטורה עדינה (grid טכני / blueprint קווים דקים) — לא תמונה של מפעל, לא גלגלי שיניים.

**S2 — Trust strip** (רכיב 7.5), על רקע לבן, צמוד מתחת להירו.

**S3 — Shop by Category**
- H2: *Shop by category*
- Grid 5×2 (טאבלט 3, מובייל 2): כרטיס זכוכית radius 18 = **אריח אייקון** + שם (Rubik 15/600) + ספירה במונו מושתק (`1,240 items`). ריחוף: טבעת במבטא + הרמה קלה.

**S4 — New Arrivals**
- H2: *Just added* + לינק *View all →*
- קרוסלה/שורה של 8 כרטיסי מוצר (מובייל: גלילה אופקית). מתעדכן אוטומטית — מוצרים אחרונים שנכנסו.

**S5 — Popular Brands**
- H2: *Popular brands*
- Grid של 15 "אריחי מותג" — כרטיס radius 16, **שם המותג בטקסט** Rubik (לא לוגו) + ספירה במונו. *All brands A–Z →* כלינק במבטא.

**S6 — Request a Part (באנר רחב, accent)**
- H2: *Looking for something discontinued?*
- טקסט: *Send us a part number, model or even a photo. We'll check our stock and our network and get back to you within 1 business day.* `{{verify SLA}}`
- CTA: **Request a Part** + משני: *or email us a list*
- איור: 3 שלבים קטנים — Send → We search → You get a quote.

**S7 — Why buy from us** (6 אריחים 3×2)
Actual photos · Clear condition grading · Secure PayPal checkout · Tracked worldwide shipping · Real people, real answers · 13K+ orders shipped `{{verify}}`

**S8 — Condition explained (קומפקטי)**
- 5 badges בשורה עם שורת הסבר לכל אחד + *Read the full condition guide →*
- מטרה: אמון. לקוח B2B רוצה לדעת מה "Used" אומר לפני שהוא לוחץ.

**S9 — Footer.**

---

### 8.2 Category / Shop / Brand / Search — תבנית ארכיון אחת

**S1 — Breadcrumbs:** Home › Industrial Automation › PLC

**S2 — כותרת עמוד**
- H1: `PLC` (בקטגוריה) / `Siemens` (במותג) / `Results for "6es7 214"` (בחיפוש)
- שורת תיאור: 1–2 שורות (בקטגוריה ובמותג — טקסט SEO קצר; את השאר בתחתית העמוד)
- ספירה: `230 items`
- בקטגוריה ראשית: צ'יפים של תת-קטגוריות מתחת לכותרת.

**S3 — Toolbar**
`[Filters (מובייל)]   230 items   Sort: Newest ▾   View: [▦ grid] [☰ list]`
Sort: Newest · Price low–high · Price high–low · Brand A–Z

- מתג grid/list = **segmented pill** (2 כפתורי אייקון, `aria-pressed`).
- מעל התוצאות: **segmented pills של Condition עם מונים** — `All 230 · New 41 · Open box 12 · Used 158 · For parts 19` — זה הסינון הראשי, זמין גם במובייל בלי לפתוח פאנל.

**S4 — Sidebar filters (דסקטופ, 260px, שמאל) / bottom sheet במובייל**
- Condition (checkbox + ספירה)
- Brand (חיפוש בתוך הרשימה + checkbox + ספירה, 8 ראשונים + "Show all")
- Category (בחיפוש ובמותג)
- Price (min–max)
- In stock only (toggle, דלוק כברירת מחדל)
- הסיידבר הוא כרטיס זכוכית (radius 20) עם כותרות קבוצה (Rubik 13/600) וקווי הפרדה ביניהן. checkbox = `check` של הבית (44px גובה שורה).
- פילטרים פעילים מוצגים כצ'יפים (pill) מעל התוצאות עם ✕ ו-*Clear all* כפתור ghost.
- במובייל: כפתור *Filters (3)* פותח **bottom sheet** (radius 22 למעלה) עם כפתור ראשי *Show 58 results*.

**S5 — תוצאות:** grid 4 בשורה (דסקטופ) / 2 (מובייל), או list. דפדוף: מספרי עמודים (לא infinite scroll — עדיף ל-SEO).

**S6 — באנר קטן אחרי 12 תוצאות:** *Not seeing the exact part? Request it →*

**S7 — טקסט SEO** בתחתית (קטגוריה/מותג): 150–300 מילים, מתקפל אחרי 4 שורות.

**מצבים מיוחדים:**
- **חיפוש בלי תוצאות:** H1 `No exact match for "XYZ-123"` + כרטיס גדול: *We may still be able to find it.* טופס Request a Part **מקוצר ומולא מראש** עם ה-Part Number שחיפשו (Email + Quantity + Send). מתחתיו: "Similar part numbers" (אם יש) ו-קטגוריות פופולריות.
- **התאמה מדויקת אחת** לחיפוש Part Number → מעבר ישיר לעמוד המוצר.

**עמוד `/brands/`:** H1 *All brands* · שורת אותיות A–Z דביקה · חיפוש מותג · רשימה בעמודות: שם + ספירה.

---

### 8.3 Product `/product/{brand}-{part-number}/` — העמוד החשוב באתר

רוב הכניסות מגוגל יגיעו לכאן ישירות. **למעלה, בלי גלילה (גם במובייל): מה זה, מצב, מלאי, מחיר, כפתור.**

**S1 — Breadcrumbs:** Home › Industrial Automation › PLC › Siemens 6ES7 214-1AG40

**S2 — Above the fold: 2 עמודות (גלריה 55% | מידע 45%)**

גלריה:
- תמונה ראשית 1:1 (contain), zoom בלחיצה (lightbox), חיצים.
- thumbnails מתחת (עד 12).
- תווית קבועה על התמונה: `📷 Actual item photos`.

עמודת מידע — **כרטיס קנייה** (זכוכית, radius 20, sticky בגלילה בדסקטופ):
```
SIEMENS                                   ← brand, לינק לעמוד המותג
6ES7 214-1AG40-0XB0                       ← H1, מונו, 32px
SIMATIC S7-1200 CPU 1214C DC/DC/DC        ← סוג המוצר (שורה אחת)
SKU: 00123 · Part #: 6ES7214-1AG40-0XB0 [⧉ copy]

[Used]  What does this mean?
"Tested and working. Light scratches on housing."   ← condition notes

● Only 1 in stock
$450.00
Ships from Israel · Handling: 1–2 business days {{verify}}
Shipping calculated at checkout

[        Add to cart        ]   ← accent
[   PayPal  Buy it now      ]   ← כפתור PayPal רשמי (צהוב), קנייה ישירה

Need more than one or a formal quote?  Contact us →
```
- **בלי Brand/MPN:** ה-H1 הוא ה-Title המלא (24px, לא מונו), ושורות brand/סוג לא מוצגות.
- **כפתור copy ליד Part Number** (כפתור אייקון קטן, `aria-label="Copy part number"`) — קונים מעתיקים אותו להזמנות רכש. אחרי לחיצה: toast *Part number copied*.
- Add to cart = **primary pill 44px ברוחב מלא**. PayPal = הכפתור הרשמי מתחתיו. *Contact us* = כפתור link.
- אחרי Add to cart: toast *Added to cart* + מונה העגלה ב-header מתעדכן.

**S3 — Buy with confidence** — משטח פנימי (radius 14) בתוך כרטיס הקנייה, מתחת לכפתורים; כל שורה: אייקון ✓ קטן במבטא + טקסט 13px.
✓ Exact item pictured · ✓ Condition clearly stated · ✓ Secure PayPal checkout (Buyer Protection) · ✓ Tracked worldwide shipping · ✓ 30-day returns `{{verify policy}}`

**S4 — טאבים (דסקטופ) / אקורדיונים (מובייל)** — הטאבים הם **segmented pills** מעל כרטיס התוכן (radius 20), לא טאבים עם קו תחתון.
1. **Specifications** — **שורות key–value** מה-Item Specifics (Brand, MPN, Series, Voltage, Model…): תווית מושתקת 13px, ערך 14–15px (ערכים טכניים במונו), קו מפריד דק, בלי קו בשורה האחרונה. אם ריק — הטאב לא מוצג.
2. **Description** — התיאור המנוקה. רוחב קריאה מקסימלי 720px.
3. **Shipping** — ארץ מוצא, זמן טיפול, משקל ומידות (אם קיימים), הערה על מכס ומיסים ביעד.
4. **Returns & Warranty** — תקציר + לינק לעמוד המלא.

**S5 — You may also need / Related**
- *More from Siemens S7-1200* (אותו מותג + אותה סדרה/קטגוריה) — שורת 4–8 כרטיסים.
- *Recently viewed* (אם יש).

**S6 — Request strip:** *Looking for a different revision or condition of this part? Request it →* (ממלא מראש את ה-Part Number).

**מובייל:**
סדר: breadcrumbs (שורה אחת, מקוצרת) → גלריה (swipe, נקודות) → brand/H1/סוג → badge+מלאי → מחיר → כפתורים → trust → אקורדיונים.
**Sticky bottom bar** אחרי שהכפתורים יוצאים מהמסך: `$450.00 · [Used] · [Add to cart]` — משטח אטום, primary pill.

**מצב Sold (כמות 0) — חשוב, יקרה הרבה:**
- העמוד **נשאר** (לגוגל ולמי שמחפש את החלק).
- במקום מחיר וכפתורים: badge אפור `Sold` + כותרת *This item has been sold.*
- כרטיס בולט: **Request this part — we may be able to source another one.** טופס מקוצר ממולא מראש (Email, Quantity, Condition required).
- מתחת: *Similar items in stock* (אותו מותג/סדרה).
- בגלריה: התמונות נשארות, עם תג `Sold` (gray pill) בפינה — לא שכבה שמסתירה את התמונה.
- כרטיס ה-Request הוא הכרטיס הראשי בעמוד במצב הזה: אריח אייקון `search`, כותרת, שדות 44px, primary pill.

---

### 8.4 Request a Part `/request-a-part/`

**S1 — Hero קצר (surface):** H1 *Can't find your part? We'll source it.* + שורה: *Send us the part number, model or a photo. We reply within 1 business day.* `{{verify}}`

**S2 — שתי עמודות: טופס (60%) | צד (40%)** — הטופס בכרטיס זכוכית (radius 20), שדות בגריד של 2 עמודות ≥640px (Notes והעלאת קבצים לרוחב מלא). כל שדה: תווית 13/500 מעל, שדה 44px radius 12, רמז 12.5 מתחת. שדות אימייל/טלפון/Part number ב-LTR ומונו לפי הצורך.

טופס:
| שדה | סוג | חובה |
|---|---|---|
| Part number | טקסט (מונו) | ✅ (או תמונה) |
| Manufacturer | טקסט + השלמה מרשימת המותגים | |
| Quantity | מספר, ברירת מחדל 1 | ✅ |
| Condition required | Any / New only / Used OK / Refurbished OK | |
| Needed by | תאריך | |
| Notes | textarea | |
| Photo / PDF / Excel | העלאה, עד 5 קבצים, 10MB | |
| Name | טקסט | ✅ |
| Company | טקסט | |
| Email | אימייל | ✅ |
| Phone / WhatsApp | טלפון עם קידומת מדינה | |
| Country | בחירה | ✅ |
- כפתור: **Send request**
- העלאת קבצים: אזור drop במשטח פנימי (radius 14) עם אייקון `upload` + קבצים שנבחרו כצ'יפים עם ✕.
- אחרי שליחה: כרטיס הצלחה (`role="status"`) עם אריח אייקון `check` בגוון ok, מספר פנייה במונו + "What happens next" (3 שלבים).
- שגיאות: מתחת לכל שדה, בטקסט (`aria-invalid` + `aria-describedby`), לא רק באדום; בראש הטופס התראה `bad` עם סיכום.

עמודה צדדית: How it works (3 שלבים עם אייקונים) · What to include for faster results (תמונה של תווית, מספר סידורי) · שאלות קצרות (Is there a fee? — No).

---

### 8.5 Cart `/cart/`
- H1 *Your cart*
- רשימת שורות בכרטיס זכוכית, קווי הפרדה בין שורות (במובייל: כרטיסים): תמונה במשטח פנימי 72px · Brand + MPN (מונו) · Condition pill · מחיר (מונו) · כמות (**נעול על 1** כשבמלאי יש 1, עם הסבר קטן `Only 1 available`) · ✕
- צד ימין (דסקטופ) / למטה (מובייל): Subtotal · Shipping: *Calculated at checkout* · **Proceed to checkout** · לוגו PayPal.
- **הודעה אם פריט נמכר בינתיים:** התראת `warn` (radius 12, אייקון בתחילה, `role="alert"`) בראש: *"Siemens 6ES7… was just sold and has been removed from your cart."* + *Request this part*.
- עגלה ריקה: מצב ריק של הבית — כרטיס, אריח אייקון `shopping-cart` גדול, *Your cart is empty*, משפט אחד, פעולה אחת: *Search parts* (primary).

### 8.6 Checkout `/checkout/`
- Header מצומצם: לוגו + *Secure checkout* 🔒 + לינק חזרה לעגלה (בלי תפריט, בלי חיפוש).
- עמוד אחד, שני טורים:
  - שמאל: 1. Contact (email, *Create an account* אופציונלי — ברירת מחדל guest) · 2. Shipping address (Country ראשון, כתובת לפי מדינה, Company, Phone, VAT/Tax ID אופציונלי) · 3. Shipping method (רדיו עם מחיר וזמן) · 4. Payment: **כפתורי PayPal** (PayPal / Pay Later / Card via PayPal — מה ש-PayPal מציג).
  - כל שלב = כרטיס זכוכית עם ראש כרטיס (מספר השלב באריח + כותרת H2 17px + סימון ✓ כשהושלם). שיטות משלוח = שורות רדיו גדולות (44px+, radius 12, השורה הנבחרת עם טבעת במבטא).
  - ימין: סיכום הזמנה דביק בכרטיס (תמונות קטנות, MPN במונו, מצב, מחירים ושורות key–value, Total במונו גדול).
- הערה קטנה מתחת לסיכום: *Import duties and taxes may apply in your country.*
- מובייל: הסיכום מתקפל בראש העמוד (`Show order summary · $450.00`).

### 8.7 Order received
- ✓ גדול + *Thank you, {name}. Order #10234 is confirmed.* (מספר במונו)
- מה עכשיו: Packed within 1–2 business days → Shipped with tracking → Delivered.
- פרטי הזמנה, כתובת, *Create an account to track this order* (לאורחים).

### 8.8 My account
ניווט צד (מובייל: טאבים): Dashboard · Orders · Addresses · Account details · Log out.
- ראש העמוד: H1 + שורת מצב ("2 orders on the way"), ומתחת שורת KPI קטנה (Orders · In transit · Delivered) במונו.
- Orders: **טבלה בדסקטופ / כרטיסים במובייל** — מספר (מונו) · תאריך (מונו) · סטטוס (pill: Processing=`blue`, Shipped=`accent`, Delivered=`ok`, Cancelled=`gray`, Refunded=`warn`) · סכום · Tracking (link) · View (ghost).
- סינון מעל הרשימה: segmented pills עם מונים.
- מצב ריק: *No orders yet* + חיפוש.
- Login/Register: עמוד אחד, שתי עמודות. **אין social login.**

### 8.9 עמודי תוכן (About, Shipping, Returns, Condition guide, FAQ, Contact, Terms, Privacy)
תבנית משותפת: breadcrumbs · H1 · תוכן ברוחב 720px · תוכן עניינים דביק בצד (עמודים ארוכים) · CTA בסוף (*Request a part* / *Contact us*).
- **Condition guide:** כרטיס זכוכית לכל אחד מ-5 המצבים: ראש כרטיס עם התג (pill) + כותרת, ואז מה זה אומר + מה בודקים + דוגמת תמונה במשטח פנימי.
- **FAQ / עמודים ארוכים:** אקורדיון = שורות 44px+ בכרטיס, קווי הפרדה, chevron מסתובב.
- **Contact:** טופס (Name, Email, Order # אופציונלי, Message) + email + WhatsApp + שעות פעילות (שעון ישראל, עם שעת UTC).
- **FAQ:** אקורדיון בקבוצות: Orders · Shipping · Payment · Returns · Sourcing.
- **About:** סיפור קצר + מספרים `{{verify}}` + תמונות מחסן/אריזה אמיתיות (placeholder).

### 8.10 404
H1 *This page doesn't exist — but your part might.* + חיפוש גדול + Request a Part + קטגוריות.

---

## 9. מה לא לעשות

- ❌ לוגו או שם של eBay, או "Buy on eBay".
- ❌ לוגואים של יצרנים (Siemens, ABB…) — רק שמות בטקסט.
- ❌ גלגלי שיניים, תמונות סטוק של מפעלים ורובוטים.
- ❌ Mega menu עם עשרות קטגוריות.
- ❌ Add to cart בכרטיס מוצר, quick view, השוואת מוצרים.
- ❌ Countdown, "X people are viewing", pop-ups של הנחה.
- ❌ Condition שמוצג רק בצבע, או כבלוק צבע מלא (תמיד זוג גוונים: טקסט + רקע בהיר).
- ❌ פינות חדות / כפתורים מלבניים, `border` כמסגרת לכרטיס, צללים כבדים.
- ❌ ערכי radius, גובה, פונט או ריווח שלא מופיעים בסעיף 6.4.
- ❌ ספינר על כל העמוד — רק skeleton.
- ❌ יותר מכפתור ראשי אחד באזור.
- ❌ טקסט אפור בהיר על לבן (ניגודיות).
- ❌ Carousel בהירו.

---

## 10. פתוח / לאמת לפני עלייה לאוויר

| נושא | סטטוס |
|---|---|
| שם המותג, לוגו, דומיין | טרם נקבע |
| צבעים סופיים | הצעה (סעיף 6.2) |
| נתוני אמון: 13K+ מכירות, 100% פידבק, שנת הקמה, YP Tech Solutions | לאמת מול החשבון |
| כמה מוצרים כוללים Brand + MPN | יימדד אחרי השלמת משיכת הפרטים מ-eBay |
| מיפוי קטגוריות eBay → 10 הקטגוריות | טרם נעשה |
| מדיניות משלוח (תעריפים, חברות, זמני טיפול) | טרם נקבע |
| מדיניות החזרות ואחריות | טרם נקבעה |
| זמן תגובה ל-Request a Part | טרם נקבע |
| האם עמודי Sold נשארים באינדקס של גוגל | המלצה: כן, עם CTA ל-Request |

---

## 11. מה לבקש מ-Claude Design (סדר עבודה מוצע)

1. **Design tokens + רכיבים** לפי שפת הבית (סעיפים 6.3–6.4א) בצבעי החנות (6.2): כפתורים (primary/secondary/ghost/link/icon), שדות, תגי Condition ו-Stock, segmented pills, כרטיס, משטח פנימי, אריח אייקון, התראות, toast, skeleton, מצב ריק, Product card (grid + list/כרטיס מובייל, עם/בלי MPN, Sold), Trust strip.
2. **Header + Footer + Search typeahead** (דסקטופ + מובייל).
3. **Product page** — שלושה מצבים: רגיל, בלי Brand/MPN, Sold. דסקטופ + מובייל.
4. **Home.**
5. **Archive** (קטגוריה + חיפוש עם תוצאות + חיפוש בלי תוצאות).
6. **Request a Part** (טופס + הצלחה).
7. **Cart + Checkout + Order received.**
8. שאר העמודים לפי התבנית המשותפת.
