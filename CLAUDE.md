# מערכת פרסום וניהול ציוד תעשייתי — CLAUDE.md

---

## 🤖 הוראות לקלוד קוד — חובה לקרוא

1. **לפני כל משימה** — קרא את `## 📋 לוג בנייה` כדי להבין מה כבר נעשה
2. **אחרי כל חלק שסיימת לבנות** — עדכן את הלוג עם מה שנעשה, בפורמט הקיים
3. **אל תקרא את כל הקבצים** — הלוג מספיק כדי להבין את המצב הנוכחי
4. **אם משהו לא עובד** — רשום אותו תחת `⚠️ בעיות ידועות`
5. **המשך תמיד מהנקודה האחרונה בלוג** — אל תבנה מחדש דברים שכבר סומנו ✅

---

## 📋 לוג בנייה

### סטטוס כללי: 🟡 בתהליך

| חלק | סטטוס | תאריך | הערות |
|-----|--------|--------|-------|
| Supabase — טבלאות | ✅ הושלם | 12/05/2026 | נוצרו products, webhook_logs, trigger, storage bucket |
| Next.js — setup בסיסי | ✅ הושלם | 12/05/2026 | Next.js 14, Tailwind, shadcn/ui, Supabase client, layout RTL+Heebo |
| `/products/new` — טופס | ✅ הושלם | 12/05/2026 | טופס מלא עם כל השדות ותצוגה מקדימה |
| העלאת תמונות — Supabase Storage | ✅ הושלם | 12/05/2026 | ImageUploader עם drag&drop, עד 20 תמונות, 10MB |
| `/dashboard` — רשימה + פילטרים | ✅ הושלם | 12/05/2026 | טבלה + סטטיסטיקות + פילטרים + חיפוש |
| כפתור העתק + פתח פייסבוק | ✅ הושלם | 12/05/2026 | מעתיק לקליפבורד + פותח קבוצת פייסבוק |
| כפתור Webhook | ✅ הושלם | 12/05/2026 | POST ל-webhook + לוג ב-webhook_logs |
| `/products/[id]` — עריכה | ✅ הושלם | 12/05/2026 | דף מוצר עם 4 כפתורי פרסום + טופס עריכה |
| `/settings` — הגדרות | ✅ הושלם | 12/05/2026 | דף הגדרות עם בדיקת webhook |
| סמן כנמכר | ✅ הושלם | 12/05/2026 | מ-dashboard וגם מדף המוצר |
| eBay — placeholder | ✅ הושלם | 12/05/2026 | Placeholder מוכן — מציג הודעה |
| Deploy ל-Railway | 🔨 בתהליך | 12/05/2026 | railway.json + standalone output מוכנים |

### ⚠️ בעיות ידועות
_אין כרגע_

### 📝 החלטות טכניות שהתקבלו
- shadcn/ui v2 (החדש) אינו תואם במלואו ל-Next.js 14 — השתמשנו ב-globals.css פשוטה ב-CSS variables ידניות
- כפתור `.bin/next` שבור ב-Node 25 — מריצים via `node dist/bin/next` ישירות
- שמירת תמונות לפני שמירת המוצר — product ID נוצר client-side עם `crypto.randomUUID()`

---

## סקירה כללית
בנה מערכת ניהול מלאה לפרסום ציוד תעשייתי ל-eBay ופייסבוק, עם מעקב סטטוס לכל מוצר.
הלקוח הוא חברת "י.פ. פתרונות טכניים" שמוכרת ציוד תעשייתי (מכונות CNC, PLC, רובוטיקה וכו׳).

---

## סטאק טכני

- **Frontend + Backend:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage (לתמונות)
- **Styling:** Tailwind CSS + shadcn/ui
- **Language:** TypeScript
- **Deploy:** Railway
- **Automation:** Webhook ל-Make.com / n8n

---

## מבנה הפרויקט

```
/app
  /dashboard          ← דף ראשי עם רשימת מוצרים
  /products/new       ← טופס הוספת מוצר חדש
  /products/[id]      ← דף מוצר בודד + עריכה
  /api
    /products         ← CRUD endpoints
    /webhook          ← שליחת webhook
    /ebay             ← eBay API (placeholder מוכן)
/components
  /ProductForm        ← טופס מוצר
  /ProductCard        ← כרטיס מוצר ברשימה
  /StatusBadge        ← תג סטטוס
  /PostPreview        ← תצוגה מקדימה של פוסט פייסבוק
  /ImageUploader      ← העלאת תמונות ל-Supabase Storage
```

---

## Supabase — טבלאות

### טבלה: `products`

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  -- פרטי מוצר
  manufacturer text not null,
  model text not null,
  category text,
  year integer,
  condition text default 'משומש - טוב',
  price numeric,
  description text,
  location text,
  phone text,

  -- תמונות (מערך של URLs מ-Supabase Storage)
  images text[] default '{}',

  -- סטטוס פרסום
  status_ebay text default 'pending',
  -- ערכים: 'pending' | 'published' | 'failed' | 'sold'
  ebay_listing_id text,
  ebay_url text,
  ebay_published_at timestamp with time zone,

  status_facebook text default 'pending',
  -- ערכים: 'pending' | 'published' | 'copied'
  facebook_published_at timestamp with time zone,

  -- סטטוס כללי
  status text default 'active',
  -- ערכים: 'active' | 'sold' | 'archived'
  sold_at timestamp with time zone,
  notes text
);
```

### טבלה: `webhook_logs`

```sql
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  product_id uuid references products(id),
  webhook_url text,
  payload jsonb,
  response_status integer,
  success boolean
);
```

---

## דפים ופונקציונליות

### 1. `/dashboard` — לוח בקרה

**כרטיסי סטטיסטיקה בראש:**
- סה״כ מוצרים
- ממתינים לפרסום (pending)
- פורסמו ב-eBay
- פורסמו בפייסבוק
- נמכרו

**טבלת מוצרים עם עמודות:**
- תמונה ראשית (thumbnail)
- יצרן + דגם
- קטגוריה
- מחיר
- סטטוס eBay (badge צבעוני)
- סטטוס פייסבוק (badge צבעוני)
- סטטוס כללי (פעיל/נמכר/ארכיון)
- תאריך יצירה
- פעולות: עריכה, פרסום, מחיקה

**פילטרים:**
- לפי סטטוס eBay
- לפי סטטוס פייסבוק
- לפי קטגוריה
- חיפוש חופשי (יצרן/דגם)

---

### 2. `/products/new` ו-`/products/[id]` — טופס מוצר

**שדות הטופס:**

```typescript
interface Product {
  manufacturer: string      // יצרן — חובה
  model: string             // דגם — חובה
  category: string          // קטגוריה (dropdown)
  year?: number             // שנת ייצור
  condition: string         // מצב (buttons: חדש / משומש-מצוין / משומש-טוב / משומש-בינוני / לחלקים)
  price?: number            // מחיר בשקלים
  description?: string      // תיאור ומפרט טכני
  location?: string         // מיקום
  phone?: string            // טלפון
  images: string[]          // URLs מ-Supabase Storage
}
```

**קטגוריות (dropdown):**
מכונת CNC, בקר PLC, מנוע סרוו, דרייבר, רובוטיקה, ציוד פנאומטי, ספק כוח, אינוורטר, ציוד מדידה, חלקי חילוף, אחר

**העלאת תמונות:**
- גרירה או לחיצה
- מקסימום 20 תמונות
- עולות ל-Supabase Storage תחת `/products/{product_id}/`
- תמונה ראשונה = תמונה ראשית
- אפשרות לסדר מחדש בגרירה (drag & drop)
- מקסימום 10MB לתמונה

**תצוגה מקדימה של פוסט:**
בצד ימין של הטופס — תצוגה חיה של הפוסט לפייסבוק בזמן מילוי הטופס.

---

### 3. כפתורי פרסום בדף המוצר

#### כפתור א׳ — העתק + פתח פייסבוק
```
1. בנה טקסט פוסט מפרטי המוצר
2. העתק לקליפבורד
3. פתח קבוצת הפייסבוק: https://www.facebook.com/groups/sells.Surplus.Industrial.Automation
4. עדכן status_facebook = 'copied' + תאריך
```

**פורמט טקסט הפוסט:**
```
🔧 {manufacturer} {model} | {category}

📌 מצב: {condition}
📅 שנת ייצור: {year}
📍 מיקום: {location}
💰 מחיר: ₪{price}

📋 פרטים נוספים:
{description}

─────────────────
י.פ. פתרונות טכניים
📞 {phone}
✉️ info@yp-ts.com
```

#### כפתור ב׳ — שלח Webhook (Make / n8n)
```typescript
// POST לכתובת ה-webhook שמוגדרת בסטינגס
{
  product_id: string,
  manufacturer: string,
  model: string,
  category: string,
  year: number,
  condition: string,
  price: number,
  description: string,
  location: string,
  phone: string,
  post_text: string,          // הטקסט המוכן לפייסבוק
  images: string[],           // מערך URLs ציבוריים מ-Supabase
  timestamp: string
}
```
אחרי שליחה מוצלחת: עדכן `status_facebook = 'published'` + תאריך

#### כפתור ג׳ — העלה ל-eBay
```typescript
// Placeholder מוכן — יחובר בשלב הבא
// מציג הודעה: "ממתין לפרטי eBay API"
// כשיחובר: עדכן status_ebay = 'published' + ebay_listing_id + ebay_url
```

#### כפתור ד׳ — סמן כנמכר
```
עדכן status = 'sold' + sold_at = now()
```

---

### 4. הגדרות מערכת (`/settings`)

שמור ב-environment variables או בטבלת `settings` בסופאבייס:

```
WEBHOOK_URL=                  # Make.com / n8n webhook URL
EBAY_APP_ID=                  # eBay App ID (Client ID)
EBAY_CERT_ID=                 # eBay Cert ID
EBAY_DEV_ID=                  # eBay Dev ID
EBAY_USER_TOKEN=              # eBay User Token
EBAY_SANDBOX=true             # true = sandbox, false = production
CONTACT_PHONE=054-2333651
CONTACT_EMAIL=info@yp-ts.com
COMPANY_NAME=י.פ. פתרונות טכניים
FACEBOOK_GROUP_URL=https://www.facebook.com/groups/sells.Surplus.Industrial.Automation
```

---

## עיצוב ו-UI

- **שפה:** עברית מלאה, RTL
- **צבעים:** רקע כהה (#0f1117), accent כתום (#f97316)
- **פונט:** Heebo (Google Fonts)
- **Badges סטטוס:**
  - pending = אפור ⏳
  - published = ירוק ✅
  - copied = כחול 📋
  - failed = אדום ❌
  - sold = סגול 🏷️

---

## סדר בנייה מומלץ

1. **התחל עם Supabase** — צור את הטבלאות
2. **בנה `/products/new`** — טופס + העלאת תמונות
3. **בנה `/dashboard`** — רשימה + פילטרים
4. **הוסף כפתורי פרסום** — העתק/פייסבוק + Webhook
5. **הוסף `/settings`** — הגדרת Webhook URL
6. **Deploy ל-Railway**
7. **Placeholder eBay** — מוכן לחיבור עתידי

---

## environment variables נדרשים

צור קובץ `.env.local` בשורש הפרויקט:

```env
NEXT_PUBLIC_SUPABASE_URL=https://eiddrogjnayyzwlwfioc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGRyb2dqbmF5eXp3bHdmaW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzU3NDgsImV4cCI6MjA5NDE1MTc0OH0.JaKc_YT9iOgvfyQLbv5FtZRxWlb7TWwuobOyD6uATq0
SUPABASE_SERVICE_ROLE_KEY=      # Settings > API > service_role > Reveal
WEBHOOK_URL=                    # יתווסף אחרי הגדרת Make/n8n
EBAY_APP_ID=                    # יתווסף אחרי eBay Developer Account
EBAY_USER_TOKEN=                # יתווסף אחרי eBay Developer Account
EBAY_SANDBOX=true
```

⚠️ ודא ש-.env.local נמצא ב-.gitignore — לעולם אל תעלה אותו ל-GitHub!

---

## 🗄️ SQL — הרץ ב-Supabase לפני הכל

כנס ל: https://eiddrogjnayyzwlwfioc.supabase.co → SQL Editor → New Query → הרץ:

```sql
-- טבלת מוצרים
create table products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  manufacturer text not null,
  model text not null,
  category text,
  year integer,
  condition text default 'משומש - טוב',
  price numeric,
  description text,
  location text,
  phone text,
  images text[] default '{}',
  status_ebay text default 'pending',
  ebay_listing_id text,
  ebay_url text,
  ebay_published_at timestamp with time zone,
  status_facebook text default 'pending',
  facebook_published_at timestamp with time zone,
  status text default 'active',
  sold_at timestamp with time zone,
  notes text
);

-- טבלת לוג webhooks
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  product_id uuid references products(id) on delete cascade,
  webhook_url text,
  payload jsonb,
  response_status integer,
  success boolean
);

-- עדכון אוטומטי של updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

-- Storage bucket לתמונות (ציבורי)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true);

create policy "Public read images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "Public upload images"
  on storage.objects for insert
  with check (bucket_id = 'product-images');

create policy "Public delete images"
  on storage.objects for delete
  using (bucket_id = 'product-images');
```

אחרי שהרצת — עדכן בלוג: שורת "Supabase — טבלאות" → ✅ הושלם

---

## הערות חשובות

- כל הטקסטים בממשק בעברית
- direction: rtl בכל המסך
- תמונות עולות לפני שמירת המוצר (Supabase Storage)
- ה-URLs של התמונות הם ציבוריים (public bucket) כדי שה-Webhook יוכל לשלוח אותם ל-Make
- אין מערכת משתמשים בשלב זה — אפליקציה פנימית ללקוח אחד
- הוסף loading states לכל הפעולות האסינכרוניות
- הוסף toast notifications להצלחה/שגיאה

---

## 🔄 הוראת עדכון לוג — חובה אחרי כל חלק

אחרי שסיימת לבנות כל חלק, עדכן את טבלת הלוג בראש הקובץ כך:

**סטטוסים אפשריים:**
- `⏳ ממתין` — טרם התחיל
- `🔨 בתהליך` — נמצא בבנייה כרגע
- `✅ הושלם` — עובד ומוכן
- `❌ נכשל` — יש בעיה, פורט תחת "בעיות ידועות"

**פורמט עדכון שורה בטבלה:**
```
| שם החלק | ✅ הושלם | DD/MM/YYYY | תיאור קצר של מה נבנה |
```

**דוגמה:**
```
| Supabase — טבלאות | ✅ הושלם | 12/05/2025 | נוצרו טבלאות products ו-webhook_logs עם כל העמודות |
```

**כמו כן:**
- אם התקבלה החלטה טכנית חשובה — הוסף אותה תחת "החלטות טכניות"
- אם נתקלת בבעיה — הוסף תחת "בעיות ידועות" עם סטטוס הפתרון
- עדכן את "סטטוס כללי" בראש הלוג בכל שלב:
  - 🔴 טרם התחיל
  - 🟡 בתהליך
  - 🟢 הושלם