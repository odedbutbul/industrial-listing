# מיפוי שדות מוצר — eBay (vizvik16) → מערכת הסנכרון → WooCommerce

> **למי:** סוכן בניית החנות (`~/Projects/industrial-parts-store`, theme `store-theme`).
> **מה:** כל שדה שקיים במוצרים, כמה מוצרים מכילים אותו בפועל, דוגמאות, ואיפה הוא אמור לשבת ב-WooCommerce.
> **מקור:** שאילתות קריאה בלבד על ה-DB בייצור (`stock-sync`), 29/09/2026. לא נגענו ב-eBay ולא בחנות.
> **הסטטוס של עמודת "יעד ב-Woo":** הצעה. היא מחייבת רק אחרי אישור של עודד, ואז היא הופכת לחוזה בין ה-theme לסנכרון (סעיף 4 ב-`work-plan.md`).

---

## 0. חשוב לדעת לפני שקוראים

- **יש 6,560 מוצרים בקטלוג, ורק ל-100 מהם יש כרגע פרטים מלאים** (GetItem). ל-6,460 האחרים יש רק שדות הרשימה (סעיף 1). משיכת הפרטים רצה כל לילה, 1,500 מוצרים בכל פעם, כך שהכיסוי המלא צפוי בעוד כ-5 לילות.
- **המדגם של 100 המוצרים מוטה:** 62 מהם של Lumenis, לעומת כ-26% Lumenis בכל הקטלוג (1,691 כותרות). **כל אחוז שמופיע בסעיפים 2–4 מבוסס על המדגם הזה.** המסמך יתעדכן כשיהיה כיסוי מלא.
- **רוב המפרט הטכני לא נמצא בשדות מובנים.** הוא כתוב כטקסט חופשי בתוך תיאור ה-HTML (סעיף 5). ב-eBay של החשבון הזה יש רק 5 סוגי Item Specifics.

---

## 1. שדות שקיימים בכל המוצרים (6,560 / 6,560)

| שדה | עמודה אצלנו | דוגמה | יעד ב-Woo (הצעה) | הערות |
|---|---|---|---|---|
| SKU | `channel_mappings.sku` | `TZ E 04 03 A 25605` | `sku` | ייחודי. **כל ה-SKU הם קודי מיקום במחסן** (קידומות: SH 1,709 · YP 1,437 · SE 662 · YP4 602 · TZ 399 · YP10 397 …). **לא מוצג באתר** (החלטת עודד, 29/09/2026) |
| eBay Item ID | `channel_mappings.ebay_item_id` | `276254931997` | meta `_sync_ebay_item_id` (מוסתר) | לשימוש פנימי בלבד. **לא להציג ולא לקשר ל-eBay** (כלל של החנות) |
| כותרת | `products.title` | `Omron PLC CQM1H-CPU11-TL PA203 OC221 …` | `name` | עד 80 תווים (מגבלת eBay), בממוצע 52. יש כותרות שנחתכו באמצע מילה (`… - Excellent Con`) |
| מחיר | `products.price` | `350.00` | `regular_price` | USD בכל המוצרים. טווח 15–9,700, חציון 170, ממוצע 385. זהה ל-eBay |
| מטבע | `products.currency` | `USD` | הגדרת החנות | ערך אחד בלבד |
| כמות זמינה | `SUM(stock_ledger.delta)` | `3` | `stock_quantity` + `manage_stock=true` | **69% יחידה אחת** (4,543), 1,826 מוצרים עם 2–5 יחידות, השאר יותר. **רק הסנכרון כותב לשדה הזה** |
| תמונה ראשית | `products.images[0]` | `https://i.ebayimg.com/…/$_57.JPG` | `images[0]` | ברשימה יש רק תמונה אחת. כל התמונות מגיעות עם הפרטים המלאים |
| תאריך העלאה ל-eBay | `products.ebay_listing_started_at` | `2023-12-29` | meta `_sync_listed_at` (מוסתר) | אפשרי למיון "חדש באתר". ❓ |

---

## 2. שדות מהפרטים המלאים (GetItem) — כיסוי מתוך 100 המוצרים במדגם

| שדה | עמודה אצלנו | כיסוי | דוגמה | יעד ב-Woo (הצעה) | הערות |
|---|---|---|---|---|---|
| **מותג** | `products.brand` (גם `item_specifics.Brand`) | 100% | `Omron` | taxonomy `product_brand` → `/brand/{slug}/` | **צריך נרמול:** `Lumenis` / `LUMENIS` / `Lumenis Inc.`, `fujikin` / `Fujikin`. 31 ערכים שונים ב-100 מוצרים. טבלת נרמול במערכת הסנכרון, לא ב-theme |
| **MPN** | `products.mpn` (גם `item_specifics.MPN`) | 99% | `0633-641-01 REV. C` | meta `_mpn` + `_mpn_norm` | כולל גרסה (`REV. X`) באותו שדה. **לא תמיד אמין:** במוצר Omron ה-MPN הוא `PC-301` אבל הכותרת היא CQM1H-CPU11. החיפוש צריך לכסות גם את הכותרת |
| **מצב** | `products.condition` + `condition_id` | 100% | `Used` / `3000` | מאפיין גלובלי `pa_condition` (לפילטר עם מונים) | ערכים שנמצאו — סעיף 3 |
| הערת מצב | `products.condition_description` | 3% | `from Brooks Load Port FIXLOAD 6 P/N 013096-336-20` | meta `_condition_notes` | כמעט תמיד ריק. בפועל המצב כתוב בתוך התיאור |
| תיאור | `products.description` | 100% | HTML | `description` | HTML מ-eBay, ממוצע 6,400 תווים, עד 12,400. כולל `<font>` ועיצוב inline, **וגם בלוקים כלליים של eBay** (Payment, Return policy, Shipping) — סעיף 5 |
| כל התמונות | `products.images` | 100% | 2–15 תמונות, ממוצע ~7 | `images` | אם זה מייצג: **כ-46,000 תמונות בכל הקטלוג.** ❓ ספריית מדיה או CDN של eBay (החלטה פתוחה) |
| קטגוריית eBay | `ebay_category_id` + `_name` | 100% | `26261` / `Business & Industrial:Other Business & Industrial` | meta `_sync_ebay_category` (מוסתר). **לא** `product_cat` ישירות | **88% ב-"Other Business & Industrial"**, רק 5 קטגוריות במדגם. **קטגוריית eBay לא מתאימה לניווט באתר.** הקטגוריות באתר צריכות מיפוי נפרד (מכותרת/מותג) — ❓ |
| Model | `item_specifics.Model` | 48% | `CS1W-DK001` | מאפיין מקומי "Model" | הרבה פעמים שווה ל-MPN |
| Country of Origin | `item_specifics["Country of Origin"]` | 99% | `Japan` · `Germany` · `United States` · `Unknown` | מאפיין מקומי | 4 ערכים. להסתיר כשהערך `Unknown` |
| Type | `item_specifics.Type` | 1% | `External Tape Drive` | מאפיין מקומי | מופיע במוצר אחד |
| משקל | `shipping.weightMajor/Minor` | **0%** | `0 lbs` בכל המוצרים | — | **אין נתון.** אי אפשר לחשב משלוח לפי משקל |
| מידות | `shipping.length/width/depth` | **0%** | `null` | — | **אין נתון** |
| סוג אריזה | `shipping.packageType` | 100% | `PackageThickEnvelope` (88) · `Letter` (12) | לא להציג | ערכי ברירת מחדל של eBay, לא נתון אמיתי |
| מיקום | `products.location` + `country` | 100% | `Kiriat gat` / `IL` | הגדרת החנות (נשלח מ-) | ערך אחד בכל המוצרים. לא לשמור לכל מוצר בנפרד |
| Subtitle | `products.subtitle` | 0% | — | — | לא בשימוש בחשבון |

---

## 3. ערכי מצב (Condition)

| `condition_id` | שם ב-eBay | במדגם | תווית באתר (הצעה) |
|---|---|---|---|
| 1000 | New | 17 | New |
| 1500 | New – Open box | 4 | New – Open Box |
| 3000 | Used | 65 | Used |
| 7000 | For parts or not working | 14 | For Parts / Not Working |
| 2000 / 2500 | Certified / Seller refurbished | 0 | Refurbished — **לפי תיעוד eBay, לא נמצא במדגם** |

- המפתח הוא `condition_id` ולא הטקסט (בטקסט יש מקף ארוך `–` שעלול להשתנות).
- **"Tested" הוא לא שדה.** הוא מופיע רק בטקסט התיאור (5 מתוך 100). פילטר "Tested" אפשרי רק אם מחליטים לחלץ אותו מהטקסט, ו-❓ זו החלטה.
- "Sold" הוא לא מצב של המוצר. הוא נגזר מכמות 0.

---

## 4. Item Specifics — הרשימה המלאה בחשבון

אלה **כל** המפתחות שנמצאו ב-`item_specifics` (ערך אחד לכל מפתח, ללא מפתחות עם כמה ערכים):

| מפתח | מוצרים | ערכים שונים |
|---|---|---|
| Brand | 100 | 31 |
| Country of Origin | 99 | 4 |
| MPN | 99 | 91 |
| Model | 48 | 44 |
| Type | 1 | 1 |

**המשמעות לבנייה:** אין כרגע "שדות דינמיים" מובנים שאפשר לסנן לפיהם (Voltage, Power, RPM וכו'). הם כתובים רק בתוך התיאור. לכן:
- עמוד המוצר מציג טבלת מאפיינים מתוך מאפייני Woo (Model, Country of Origin וכל מפתח חדש שיופיע). **ה-theme צריך להציג כל מאפיין שקיים, בלי רשימה קשיחה**, כי מפתחות חדשים עשויים להופיע כשהכיסוי יגדל.
- פילטרים בשלב ראשון: **Brand, Condition, מחיר, זמינות**. אין בנתונים Location או Product type, אז לא בונים אותם (כמו שכבר נקבע ב-`work-plan.md` §5).

---

## 5. מה כתוב בתוך התיאור (לא מובנה)

תוויות שמופיעות ב-`<strong>Label:</strong>` בתוך התיאור, 3 מוצרים ומעלה מתוך 100:

| סוג | תוויות |
|---|---|
| מפרט | model (10), specifications (7), flow rate (5), weight (4), calibration (4), serial number (4), gas type (3), interface (3), manufacturer (3), technical specifications (3) |
| שיווק | features / key features (4), applications (3), included (4), description / item description (4 / 3) |
| **תבנית כללית של eBay** | important points for buyers (9), condition (9), payment (4), return policy (4), shipping (4), returns (3), shipping and handling (3) |

- 15% מהתיאורים כוללים "Specifications", ו-17% כוללים רשימת `<li>`.
- **ניקוי תיאור (`lib/woo/clean-description.ts`, מ-29/09/2026):** הסנכרון מסיר את בלוקי Payment / Shipping / Returns / Feedback / International / Important Points, שורות שמזכירות eBay, PayPal, FedEx או אחריות, ושורה ראשונה שחוזרת על שם המוצר. ה-HTML מצומצם ל-`p, ul, li, strong, em, h3`. מדידה על 100 התיאורים: 76 יוצאים **ריקים** (היה בהם רק שם המוצר + תבנית החשבון), ובשאר נשאר המפרט. **ה-theme חייב להסתיר תיאור ריק.**
- ❓ ניקוי HTML (טרם הוחלט): `<font>`, `style` inline ו-`face` מ-eBay מתנגשים עם העיצוב. ההצעה: הסנכרון מנקה את ה-HTML לרשימה סגורה של תגיות (`p, ul, ol, li, strong, em, br, table, tr, td, th, h3, h4`) לפני הכתיבה ל-Woo.
- חילוץ המפרט מהתיאור לשדות (למשל עם מודל שפה) אפשרי כשלב נפרד בעתיד, ולא נכלל כאן.

---

## 6. חוזה ב-WooCommerce — סיכום מפתחות (הצעה)

| Woo | מקור | נכתב ע"י | מוצג באתר |
|---|---|---|---|
| `sku` | `channel_mappings.sku` | סנכרון | **לא** (החלטה 29/09/2026) |
| `name` | `title` | סנכרון | כן |
| `regular_price` | `price` | סנכרון | כן |
| `manage_stock=true`, `stock_quantity` | ledger | **רק סנכרון** | כן (In stock / Last one / Sold) |
| `description` | `description` מנוקה | סנכרון | כן |
| `images` (ראשית בלבד) + meta `_sync_gallery` (JSON של שאר כתובות eBay) | `images` | סנכרון | כן |
| `product_brand` | `brand` מנורמל | סנכרון | כן + עמוד מותג |
| `pa_condition` (גלובלי) | `condition_id` | סנכרון | כן + פילטר |
| meta `_mpn`, `_mpn_norm` | `mpn` | סנכרון | כן + חיפוש |
| meta `_condition_notes` | `condition_description` | סנכרון | רק כשיש ערך |
| מאפיינים מקומיים | כל `item_specifics` חוץ מ-Brand/MPN | סנכרון | טבלת מאפיינים |
| `product_cat` | `categorize.ts` (סוג מוצר) | סנכרון | כן |
| meta `_sync_ebay_item_id`, `_sync_ebay_category`, `_sync_listed_at`, `_sync_updated_at` | מערכת הסנכרון | סנכרון | **לא** (מוסתרים, עם קו תחתון) |
| `status` | `draft` ביצירה | סנכרון, ואז ידני | — |

**כללים ל-theme:**
- ה-theme **קורא בלבד**. הוא לא כותב לאף אחד מהשדות האלה (כלל בחנות).
- כל שדה יכול להיות ריק (6,460 מוצרים עדיין בלי פרטים מלאים). כל רכיב צריך להתמודד עם ערך חסר ולהסתיר את השורה.
- Brand ו-MPN נמצאים גם בשדות קבועים וגם ב-`item_specifics`. **לא להציג אותם פעמיים** בטבלת המאפיינים.

---

## 7. שאלות פתוחות (❓) — לעודד

1. ~~SKU~~ — ✅ לא מוצג באתר (29/09/2026).
2. ~~תמונות~~ — ✅ הראשית יורדת לחנות (`images[0]`), השאר נשארות ב-eBay ונשמרות כ-JSON ב-meta `_sync_gallery` (29/09/2026). ה-theme מציג את הגלריה מהכתובות האלה.
3. קטגוריות האתר — שיוך אוטומטי לפי סוג המוצר (`lib/woo/categorize.ts`): כללים על הכותרת, קטגוריית eBay ותחילת התיאור, ברירת מחדל לפי מותג. מוצר מקבל תת-קטגוריה + אב, ולפעמים גם ציר נוסף (Medical & Aesthetic / Semiconductor). תתי-קטגוריות חסרות נוצרות בחנות בשליחה; קיימות לא משתנות. על 100 המוצרים: כולם שויכו.
4. ~~בלוקי מדיניות בתיאור~~ — ✅ מנוקים בסנכרון (`clean-description.ts`, 29/09/2026).
5. ~~"Tested"~~ — ✅ לא מחלצים כרגע; נשאר בתיאור בלבד (29/09/2026).
6. משקל ומידות לא קיימים. איך מחשבים משלוח? — נדחה להמשך.

---

*עדכון הבא: אחרי שמשיכת הפרטים המלאים תכסה את כל הקטלוג (כ-5 לילות). אז יורצו שוב אותן שאילתות על כל 6,560 המוצרים.*
