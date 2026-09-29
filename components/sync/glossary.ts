// מילון המונחים של מסך התובנות. כל מדד במסך מקשר לכאן (/sync/insights/glossary#<id>).
// "טווח מקובל" = הערכה כללית לחנויות אונליין — משתנה מאוד לפי תחום, מחיר ומקור התנועה. לא יעד מחייב.

export type GlossaryGroup = 'search' | 'traffic' | 'sales' | 'marketing' | 'store'

export interface GlossaryTerm {
  id: string
  term: string
  en?: string
  group: GlossaryGroup
  /** מה זה, במשפט-שניים */
  def: string
  formula?: string
  /** איך קוראים את המספר / מה טווח סביר */
  read?: string
  /** מאיפה המספר מגיע במערכת */
  source?: string
}

export const GLOSSARY_GROUPS: [GlossaryGroup, string][] = [
  ['search', 'חיפוש בגוגל (Search Console)'],
  ['traffic', 'תנועה והתנהגות (Google Analytics)'],
  ['sales', 'מכירות והמרות'],
  ['marketing', 'שיווק ורווחיות'],
  ['store', 'חנות, מוצרים ומלאי'],
]

export const GLOSSARY: GlossaryTerm[] = [
  // ── חיפוש ──
  { id: 'impressions', term: 'חשיפות', en: 'Impressions', group: 'search', def: 'כמה פעמים דף מהאתר הופיע בתוצאות החיפוש של גוגל. גם אם הגולש לא גלל עד אליו — עדיין נספר.', read: 'הרבה חשיפות ומעט הקלקות = הכותרת או המיקום לא מושכים. מעט חשיפות = גוגל כמעט לא מציג את הדף.', source: 'Search Console' },
  { id: 'clicks', term: 'הקלקות', en: 'Clicks', group: 'search', def: 'כמה פעמים גולשים הקליקו על תוצאה של האתר בגוגל ונכנסו אליו. רק חיפוש אורגני (לא מודעות).', source: 'Search Console' },
  { id: 'ctr', term: 'שיעור הקלקה', en: 'CTR — Click-Through Rate', group: 'search', def: 'איזה אחוז מהחשיפות הפכו להקלקה.', formula: 'הקלקות ÷ חשיפות', read: 'תלוי מאוד במיקום: במקום 1 בערך 25%–30%, במקום 5 בערך 5%, במקום 10 בערך 2% (קירוב ממחקרים פומביים). CTR נמוך מהצפוי למיקום = כדאי לשכתב כותרת ותיאור.', source: 'Search Console' },
  { id: 'avg-position', term: 'מיקום ממוצע', en: 'Average position', group: 'search', def: 'המיקום הממוצע של האתר בתוצאות החיפוש (1 = התוצאה הראשונה). מחושב בממוצע משוקלל לפי חשיפות.', read: 'נמוך יותר = טוב יותר. 1–10 = העמוד הראשון, 11–20 = העמוד השני.', source: 'Search Console' },
  { id: 'search-query', term: 'ביטוי חיפוש', en: 'Search query / Keyword', group: 'search', def: 'המילים שהגולש הקליד בגוגל ובעקבותיהן הופיע האתר.', source: 'Search Console' },
  { id: 'striking-distance', term: 'כמעט בעמוד הראשון', en: 'Striking distance', group: 'search', def: 'ביטויים שבהם האתר במיקום 8–20. קפיצה קטנה בדירוג מכניסה אותם לעמוד הראשון, שם נמצאות רוב ההקלקות.', read: 'ההזדמנות הכי זולה בקידום אורגני: לחזק דף שכבר מדורג במקום לבנות חדש.' },
  { id: 'meta-title', term: 'כותרת ותיאור לגוגל', en: 'Meta title / Meta description', group: 'search', def: 'הכותרת הכחולה ושתי שורות הטקסט שמופיעות בתוצאת החיפוש. נקבעות בדף המוצר (או בתוסף SEO).', read: 'מה שמשכנע להקליק: שם הדגם והיצרן בהתחלה, מצב המוצר, ויתרון ברור.' },
  { id: 'indexing', term: 'אינדוקס', en: 'Indexing', group: 'search', def: 'האם גוגל שמר את הדף במאגר שלו. דף שלא באינדקס לא יופיע בחיפוש בכלל.', read: 'בודקים ב-Search Console ← "בדיקת כתובת URL".' },
  { id: 'sitemap', term: 'מפת אתר', en: 'Sitemap', group: 'search', def: 'קובץ שמרכז את כל כתובות האתר כדי שגוגל ימצא אותן. וורדפרס יוצר אותו אוטומטית; מגישים אותו ב-Search Console.' },
  { id: 'internal-links', term: 'קישורים פנימיים', en: 'Internal links', group: 'search', def: 'קישורים מדף אחד באתר לדף אחר באתר (קטגוריה → מוצר, מוצר → מוצרים דומים). עוזרים לגוגל להבין מה חשוב ומעבירים סמכות בין דפים.' },
  { id: 'organic', term: 'תנועה אורגנית', en: 'Organic traffic', group: 'search', def: 'גולשים שהגיעו מתוצאות חיפוש רגילות, בלי לשלם על מודעה. ההפך: תנועה ממומנת (Paid).' },
  { id: 'core-web-vitals', term: 'מדדי חוויית דף', en: 'Core Web Vitals', group: 'search', def: 'שלושה מדדים של גוגל למהירות ויציבות הדף: LCP (כמה מהר נטען התוכן הראשי), INP (כמה מהר הדף מגיב ללחיצה), CLS (כמה התוכן "קופץ" בזמן הטעינה). משפיעים על דירוג ועל המרות.', source: 'Search Console ← חוויית דף' },

  // ── תנועה ──
  { id: 'ga4', term: 'Google Analytics 4', en: 'GA4', group: 'traffic', def: 'הכלי של גוגל שמודד מה גולשים עושים באתר: מאיפה הגיעו, אילו דפים ראו, מה הוסיפו לעגלה ומה קנו.' },
  { id: 'users', term: 'משתמשים', en: 'Users', group: 'traffic', def: 'כמה אנשים (דפדפנים) שונים ביקרו באתר. אותו אדם בטלפון ובמחשב נספר פעמיים.', read: 'במסך הזה המשתמשים מסוכמים לפי ימים — מי שביקר ביומיים שונים נספר פעמיים. לכן זה קירוב כלפי מעלה.', source: 'Google Analytics' },
  { id: 'new-users', term: 'משתמשים חדשים וחוזרים', en: 'New vs returning users', group: 'traffic', def: 'חדש = ביקור ראשון באתר. חוזר = כבר היה פעם. הרבה חוזרים = אמון ועניין; בציוד תעשייתי קונים רבים חוזרים כמה פעמים לפני שקונים.', source: 'Google Analytics' },
  { id: 'sessions', term: 'ביקורים', en: 'Sessions', group: 'traffic', def: 'ביקור אחד באתר, מהכניסה ועד היציאה (או 30 דקות בלי פעילות). משתמש אחד יכול לבצע כמה ביקורים.', source: 'Google Analytics' },
  { id: 'page-views', term: 'צפיות בדפים', en: 'Page views', group: 'traffic', def: 'כמה פעמים נטענו דפים באתר. רענון של אותו דף נספר שוב.', source: 'Google Analytics' },
  { id: 'pages-per-session', term: 'דפים לביקור', en: 'Pages per session', group: 'traffic', def: 'כמה דפים ראה גולש בממוצע בביקור אחד.', formula: 'צפיות ÷ ביקורים', read: 'יותר מ-2 בדרך כלל אומר שהגולשים ממשיכים לחפש באתר.' },
  { id: 'engaged-session', term: 'ביקור מעורב', en: 'Engaged session', group: 'traffic', def: 'ביקור שנמשך יותר מ-10 שניות, או שכלל 2 צפיות ומעלה, או שהייתה בו המרה (למשל הוספה לעגלה). ההגדרה של GA4.' },
  { id: 'engagement-rate', term: 'שיעור מעורבות', en: 'Engagement rate', group: 'traffic', def: 'איזה אחוז מהביקורים היו מעורבים.', formula: 'ביקורים מעורבים ÷ ביקורים', read: 'בדרך כלל 50%–70% בחנויות (הערכה כללית). מתחת ל-40% מערוץ מסוים = תנועה לא רלוונטית או בוטים.' },
  { id: 'bounce-rate', term: 'שיעור נטישה', en: 'Bounce rate', group: 'traffic', def: 'אחוז הביקורים שלא היו מעורבים — נכנסו ויצאו כמעט מיד. ב-GA4 זה בדיוק ההשלמה של שיעור המעורבות.', formula: '1 − שיעור מעורבות', read: 'נמוך יותר = טוב יותר.' },
  { id: 'avg-engagement-time', term: 'זמן מעורבות ממוצע', en: 'Average engagement time', group: 'traffic', def: 'כמה זמן בממוצע הדף היה פתוח ובפוקוס אצל משתמש (כשהלשונית ברקע — לא נספר).', formula: 'סך זמן המעורבות ÷ משתמשים' },
  { id: 'traffic-channel', term: 'ערוץ תנועה', en: 'Default channel group', group: 'traffic', def: 'מאיפה הגיעו הגולשים. Organic Search = חיפוש רגיל בגוגל/בינג · Paid Search = מודעות בגוגל · Direct = הקלידו כתובת או אין מקור ידוע · Referral = קישור מאתר אחר · Organic Social / Paid Social = רשתות חברתיות רגיל / ממומן · Email = ניוזלטר · Unassigned = GA לא הצליח לשייך.', source: 'Google Analytics' },
  { id: 'device', term: 'סוג מכשיר', en: 'Device category', group: 'traffic', def: 'מחשב (desktop), נייד (mobile) או טאבלט (tablet). בציוד תעשייתי קונים רבים מחפשים בנייד וקונים במחשב.' },
  { id: 'landing-page', term: 'דף נחיתה', en: 'Landing page', group: 'traffic', def: 'הדף הראשון שהגולש ראה בביקור. בחנות — לרוב דף מוצר שהגיע אליו מגוגל או ממודעה.' },
  { id: 'utm', term: 'תגיות UTM', en: 'UTM parameters', group: 'traffic', def: 'תוספת לכתובת (?utm_source=facebook&utm_campaign=…) שמסמנת ל-GA מאיזה קמפיין הגיע הגולש. בלי UTM, קמפיינים רבים נופלים ל-Direct או Referral.' },

  // ── מכירות ──
  { id: 'item-views', term: 'צפיות במוצר', en: 'Items viewed', group: 'sales', def: 'כמה פעמים נצפה דף של מוצר מסוים (אירוע view_item).', source: 'Google Analytics — דורש מעקב איקומרס' },
  { id: 'add-to-cart', term: 'הוספות לעגלה', en: 'Add to cart', group: 'sales', def: 'כמה פעמים לחצו "הוספה לעגלה".', source: 'Google Analytics — דורש מעקב איקומרס' },
  { id: 'cart-rate', term: 'שיעור הוספה לעגלה', en: 'View-to-cart rate', group: 'sales', def: 'איזה אחוז מהצפיות במוצר הסתיימו בהוספה לעגלה.', formula: 'הוספות לעגלה ÷ צפיות במוצר', read: 'נמוך = משהו בדף המוצר לא משכנע: מחיר, תמונות, מפרט, משלוח.' },
  { id: 'checkout', term: 'התחלת תשלום', en: 'Begin checkout', group: 'sales', def: 'כמה פעמים גולשים עברו מהעגלה לקופה.' },
  { id: 'purchases', term: 'רכישות', en: 'Purchases / Transactions', group: 'sales', def: 'הזמנות שהושלמו באתר, לפי GA. יכול להיות מעט שונה ממספר ההזמנות ב-WooCommerce (חוסמי פרסומות, ביטולים).' },
  { id: 'revenue', term: 'הכנסות', en: 'Revenue', group: 'sales', def: 'סכום ההזמנות שהושלמו באתר לפי GA (כולל משלוח ומס — לפי ההגדרה בתוסף). ההכנסות מ-eBay מוצגות בנפרד, מתוך ההזמנות שנקלטו במערכת.' },
  { id: 'conversion-rate', term: 'שיעור המרה', en: 'Conversion rate', group: 'sales', def: 'איזה אחוז מהביקורים הסתיימו ברכישה.', formula: 'רכישות ÷ ביקורים', read: 'בחנויות בדרך כלל 1%–3% (הערכה כללית); בציוד תעשייתי יקר לרוב נמוך יותר — חשוב לעקוב אחרי המגמה, לא אחרי מספר קסם.' },
  { id: 'aov', term: 'ערך הזמנה ממוצע', en: 'AOV — Average Order Value', group: 'sales', def: 'כמה שווה הזמנה ממוצעת.', formula: 'הכנסות ÷ רכישות' },
  { id: 'revenue-per-session', term: 'הכנסה לביקור', en: 'Revenue per session', group: 'sales', def: 'כמה כל ביקור באתר "שווה" בממוצע. עוזר להחליט כמה מותר לשלם על גולש.', formula: 'הכנסות ÷ ביקורים' },
  { id: 'cart-abandonment', term: 'נטישת עגלה', en: 'Cart abandonment rate', group: 'sales', def: 'איזה אחוז מההוספות לעגלה לא הסתיימו ברכישה.', formula: '1 − (רכישות ÷ הוספות לעגלה)', read: 'בחנויות בדרך כלל כ-70% (הערכה כללית). חשוב לעקוב אחרי שינויים.' },
  { id: 'checkout-abandonment', term: 'נטישה בקופה', en: 'Checkout abandonment rate', group: 'sales', def: 'איזה אחוז ממי שהתחיל לשלם לא סיים.', formula: '1 − (רכישות ÷ התחלות תשלום)', read: 'גבוה = בעיה בקופה עצמה: עלות משלוח מפתיעה, אמצעי תשלום חסר, תקלה.' },
  { id: 'funnel', term: 'משפך מכירה', en: 'Sales funnel', group: 'sales', def: 'השלבים שגולש עובר עד רכישה: ביקור → הוספה לעגלה → תשלום → רכישה. בכל שלב חלק נושרים; המשפך מראה איפה הנשירה הכי גדולה.' },
  { id: 'ecommerce-tracking', term: 'מעקב איקומרס', en: 'Ecommerce tracking', group: 'sales', def: 'אירועים שהחנות שולחת ל-GA (צפייה במוצר, הוספה לעגלה, תשלום, רכישה). בלעדיהם GA רואה ביקורים אבל לא מכירות. מותקן בחנות באמצעות תוסף.' },

  // ── שיווק ──
  { id: 'ad-spend', term: 'הוצאות שיווק', en: 'Ad spend / Marketing spend', group: 'marketing', def: 'כמה שולם על פרסום בתקופה. עלות Google Ads נמשכת אוטומטית אם החשבון מקושר ל-GA; כל השאר (פייסבוק, ספקים, עמלות) מוזן ידנית בלשונית "שיווק ו-ROI".' },
  { id: 'roas', term: 'החזר על הוצאות פרסום', en: 'ROAS — Return On Ad Spend', group: 'marketing', def: 'כמה דולר הכנסה חזרו על כל דולר פרסום.', formula: 'הכנסות ÷ הוצאות שיווק', read: 'מתחת ל-1 = הפרסום מכניס פחות ממה שהוא עולה. כמה מעל 1 צריך — תלוי ברווח הגולמי: ברווח של 30% צריך ROAS של 3.3 ומעלה רק כדי לא להפסיד.' },
  { id: 'roi', term: 'החזר על ההשקעה', en: 'ROI — Return On Investment', group: 'marketing', def: 'כמה הרווחת ביחס למה שהשקעת, באחוזים.', formula: '(הכנסות − הוצאות שיווק) ÷ הוצאות שיווק', read: 'במסך הזה ה-ROI מחושב על הכנסות ולא על רווח, כי עלות המוצרים לא נמצאת במערכת. ה-ROI האמיתי (אחרי עלות סחורה ומשלוח) נמוך יותר.' },
  { id: 'cpa', term: 'עלות לרכישה', en: 'CPA — Cost Per Acquisition', group: 'marketing', def: 'כמה עלה בממוצע להביא הזמנה אחת.', formula: 'הוצאות שיווק ÷ רכישות', read: 'צריך להיות נמוך משמעותית מהרווח בהזמנה ממוצעת.' },
  { id: 'cpc', term: 'עלות לקליק', en: 'CPC — Cost Per Click', group: 'marketing', def: 'כמה עלתה בממוצע הקלקה אחת על מודעה.', formula: 'עלות מודעות ÷ הקלקות על מודעות', source: 'Google Ads (דרך GA)' },
  { id: 'cac', term: 'עלות גיוס לקוח', en: 'CAC — Customer Acquisition Cost', group: 'marketing', def: 'כמה עולה להביא לקוח חדש (לא הזמנה). דומה ל-CPA, אבל לקוח שחוזר ומזמין שוב לא נספר פעמיים.' },
  { id: 'ltv', term: 'ערך לקוח לאורך זמן', en: 'LTV / CLV — Customer Lifetime Value', group: 'marketing', def: 'כמה כסף לקוח מכניס לאורך כל הקשר איתו. כשה-LTV גבוה, מותר לשלם יותר על הזמנה ראשונה.' },
  { id: 'gross-margin', term: 'רווח גולמי', en: 'Gross margin', group: 'marketing', def: 'מה נשאר מההכנסה אחרי עלות הסחורה.', formula: '(מחיר מכירה − עלות המוצר) ÷ מחיר מכירה', read: 'לא נמדד במערכת — עלות המוצרים לא מוזנת. נדרש כדי לדעת מה ה-ROAS המינימלי.' },
  { id: 'attribution', term: 'ייחוס', en: 'Attribution', group: 'marketing', def: 'איך מחליטים איזה ערוץ "קיבל את הקרדיט" על מכירה כשהקונה הגיע כמה פעמים ממקורות שונים. GA4 מחלק את הקרדיט לפי המודל שלו — לכן סכומי הערוצים יכולים להיות שונים ממה שמערכת הפרסום מדווחת.' },

  // ── חנות ──
  { id: 'stock-status', term: 'מצב מלאי', en: 'Stock status', group: 'store', def: 'האם המוצר זמין לקנייה. מקור האמת במערכת הוא ה-ledger (סכום כל שינויי המלאי); בחנות מוצג instock / outofstock.' },
  { id: 'sell-through', term: 'קצב מכירה', en: 'Sell-through', group: 'store', def: 'כמה מהמלאי נמכר בתקופה. מוצר שנמכר היטב ב-eBay הוא מועמד טבעי לקידום באתר.', formula: 'יחידות שנמכרו ÷ (יחידות שנמכרו + מלאי)' },
  { id: 'multichannel', term: 'מכירה רב-ערוצית', en: 'Multichannel', group: 'store', def: 'אותו מלאי נמכר גם ב-eBay וגם באתר. המערכת מסנכרנת את הכמויות כדי שיחידה אחת לא תימכר פעמיים.' },
]

export const termHref = (id: string) => `/sync/insights/glossary#${id}`
export const termById = new Map(GLOSSARY.map((t) => [t.id, t]))
