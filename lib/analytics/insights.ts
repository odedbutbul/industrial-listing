import type { BreakdownRow, CatalogRef, EbaySeller, ItemStat, PageStat, QueryStat, SearchTotals, SiteTotals } from './report'

// מנוע התובנות: כללים קבועים על המספרים — בלי AI. כל תובנה מציגה את המספרים שגרמו לה.
// הספים כאן במקום אחד (THRESHOLDS) כדי שיהיה קל לכוונן אותם.

export type InsightCategory = 'search' | 'products' | 'stock' | 'traffic' | 'sales' | 'marketing' | 'setup'
export type InsightSeverity = 'high' | 'medium' | 'low'

export interface InsightItem {
  label: string
  sub?: string
  href?: string
  /** קישור פנימי במערכת (/sync/products/…) */
  internal?: string
}

export interface Insight {
  key: string
  rule: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  finding: string
  action: string
  metrics: [string, string][]
  items?: InsightItem[]
  /** מונחים מהמילון שמסבירים את התובנה */
  terms: string[]
  /** לדירוג: גבוה = חשוב יותר */
  impact: number
}

export const THRESHOLDS = {
  lowCtrMinImpressions: 100,
  lowCtrMaxPosition: 10,
  /** CTR מתחת לחצי מהצפוי למיקום */
  lowCtrFactor: 0.5,
  strikingMinPos: 8,
  strikingMaxPos: 20,
  strikingMinImpressions: 30,
  dropMinPrevClicks: 10,
  dropFactor: 0.5,
  siteDropMinPrevSessions: 50,
  siteDropFactor: 0.7,
  viewsNoCartMin: 20,
  cartNoBuyMin: 3,
  oosMinViews: 10,
  oosMinImpressions: 50,
  noImpressionsMinAgeDays: 30,
  checkoutAbandonMinCheckouts: 10,
  checkoutAbandonMax: 0.7,
  lowEngagementMinSessions: 50,
  lowEngagementRate: 0.4,
  mobileMinSessions: 50,
  mobileGapFactor: 0.5,
  trackingMinSessions: 50,
  risingMinImpressions: 50,
  risingFactor: 2,
} as const

/**
 * CTR צפוי לפי מיקום בתוצאות האורגניות — קירוב ממחקרים פומביים (משתנה לפי תחום ותצוגת התוצאות).
 * משמש רק כקו ייחוס לזיהוי כותרות חלשות.
 */
export const EXPECTED_CTR = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018]
export const expectedCtr = (position: number) => EXPECTED_CTR[Math.min(EXPECTED_CTR.length, Math.max(1, Math.round(position))) - 1]

export interface InsightInput {
  days: number
  setup: { gsc: boolean; ga4: boolean; woo: boolean; gscRange: unknown; gaRange: unknown; ecommerceTracking: boolean; catalogProducts: number }
  search: { cur: SearchTotals; prev: SearchTotals }
  site: { cur: SiteTotals; prev: SiteTotals }
  marketing: { cur: { totalSpend: number; roas: number | null; roi: number | null } }
  channels: BreakdownRow[]
  devices: BreakdownRow[]
  allPages: PageStat[]
  allQueries: QueryStat[]
  allItems: ItemStat[]
  catalog: CatalogRef[]
  ebaySellers: EbaySeller[]
  now?: Date
}

const T = THRESHOLDS
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`)
const int = (v: number) => Math.round(v).toLocaleString('en-US')
const pos = (v: number | null) => (v === null ? '—' : v.toFixed(1))
const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const change = (cur: number, prev: number) => (prev > 0 ? `${cur >= prev ? '+' : ''}${(((cur - prev) / prev) * 100).toFixed(0)}%` : '—')

const productLabel = (p: PageStat) => p.product?.name ?? p.page
const productInternal = (c: CatalogRef | null) => (c?.productId ? `/sync/products/${c.productId}` : undefined)

export function buildInsights(d: InsightInput): Insight[] {
  const out: Insight[] = []
  const now = d.now ?? new Date()
  const period = `ב-${d.days} הימים האחרונים`

  // ── הגדרה ──────────────────────────────────────────────────────────────────
  if (d.setup.ga4 && d.site.cur.sessions >= T.trackingMinSessions && !d.setup.ecommerceTracking && d.site.cur.addToCarts === 0) {
    out.push({
      key: 'setup:ecommerce',
      rule: 'no_ecommerce_tracking',
      category: 'setup',
      severity: 'high',
      title: 'GA לא מקבל נתוני מכירות מהחנות',
      finding: `נרשמו ${int(d.site.cur.sessions)} ביקורים, אבל אף הוספה לעגלה ואף מוצר שנצפה. כנראה שמעקב האיקומרס לא מותקן בחנות.`,
      action: 'להתקין בחנות תוסף ששולח אירועי איקומרס ל-GA4 (למשל Google for WooCommerce או GTM4WP) ולוודא שה-item_id הוא ה-SKU.',
      metrics: [['ביקורים', int(d.site.cur.sessions)], ['הוספות לעגלה', '0']],
      terms: ['ga4', 'ecommerce-tracking', 'add-to-cart'],
      impact: 10_000,
    })
  }

  // ── תנועה: ירידה כללית ────────────────────────────────────────────────────
  const s = d.site
  if (s.prev.sessions >= T.siteDropMinPrevSessions && s.cur.sessions < s.prev.sessions * T.siteDropFactor) {
    out.push({
      key: 'traffic:site-drop',
      rule: 'site_drop',
      category: 'traffic',
      severity: 'high',
      title: 'ירידה חדה בביקורים באתר',
      finding: `${int(s.cur.sessions)} ביקורים ${period}, לעומת ${int(s.prev.sessions)} בתקופה שלפני (${change(s.cur.sessions, s.prev.sessions)}).`,
      action: 'לבדוק באיזה ערוץ תנועה הירידה (טבלת מקורות התנועה), אם האתר היה זמין, ואם השתנו מודעות או דירוגים.',
      metrics: [['עכשיו', int(s.cur.sessions)], ['קודם', int(s.prev.sessions)], ['שינוי', change(s.cur.sessions, s.prev.sessions)]],
      terms: ['sessions', 'traffic-channel'],
      impact: (s.prev.sessions - s.cur.sessions) * 5,
    })
  }
  const sc = d.search
  if (sc.prev.clicks >= T.dropMinPrevClicks * 3 && sc.cur.clicks < sc.prev.clicks * T.siteDropFactor) {
    out.push({
      key: 'search:site-drop',
      rule: 'search_drop',
      category: 'search',
      severity: 'high',
      title: 'ירידה בהקלקות מגוגל',
      finding: `${int(sc.cur.clicks)} הקלקות מחיפוש אורגני ${period}, לעומת ${int(sc.prev.clicks)} קודם (${change(sc.cur.clicks, sc.prev.clicks)}).`,
      action: 'לבדוק ב-Search Console אם יש בעיות אינדוקס או עדכון אלגוריתם, ואילו דפים ירדו (תובנות "ירידה בדף" למטה).',
      metrics: [['הקלקות עכשיו', int(sc.cur.clicks)], ['קודם', int(sc.prev.clicks)], ['מיקום ממוצע', pos(sc.cur.position)]],
      terms: ['clicks', 'avg-position'],
      impact: (sc.prev.clicks - sc.cur.clicks) * 8,
    })
  }

  // ── חיפוש: דף שירד ───────────────────────────────────────────────────────
  for (const p of d.allPages) {
    if (p.prevClicks < T.dropMinPrevClicks || p.clicks > p.prevClicks * T.dropFactor) continue
    out.push({
      key: `search:page-drop:${p.page}`,
      rule: 'page_drop',
      category: 'search',
      severity: p.prevClicks - p.clicks >= 30 ? 'high' : 'medium',
      title: `ירידה בהקלקות לדף: ${productLabel(p)}`,
      finding: `${int(p.clicks)} הקלקות ${period}, לעומת ${int(p.prevClicks)} קודם (${change(p.clicks, p.prevClicks)}).`,
      action: 'לבדוק ב-Search Console את הדף (בדיקת כתובת URL): האם הוא עדיין באינדקס, האם השתנה תוכן או כותרת, ואם המוצר אזל.',
      metrics: [['עכשיו', int(p.clicks)], ['קודם', int(p.prevClicks)], ['מיקום', pos(p.position)]],
      items: [{ label: p.page, internal: productInternal(p.product) }],
      terms: ['clicks', 'indexing'],
      impact: (p.prevClicks - p.clicks) * 4,
    })
  }

  // ── חיפוש: כותרת חלשה (CTR נמוך) ─────────────────────────────────────────
  // דף שההקלקות אליו קרסו כבר קיבל תובנת "ירידה" — לא מוסיפים עליו גם CTR נמוך (אותה סיבה)
  const dropped = new Set(out.filter((i) => i.rule === 'page_drop').map((i) => i.key.slice('search:page-drop:'.length)))
  for (const p of d.allPages) {
    if (dropped.has(p.page)) continue
    if (p.impressions < T.lowCtrMinImpressions || p.position === null || p.position > T.lowCtrMaxPosition || p.ctr === null) continue
    const exp = expectedCtr(p.position)
    if (p.ctr >= exp * T.lowCtrFactor) continue
    const missed = p.impressions * exp - p.clicks
    out.push({
      key: `search:low-ctr:${p.page}`,
      rule: 'low_ctr',
      category: 'search',
      severity: missed >= 50 ? 'high' : 'medium',
      title: `מופיע בגוגל אבל כמעט לא מקליקים: ${productLabel(p)}`,
      finding: `${int(p.impressions)} חשיפות במיקום ממוצע ${pos(p.position)}, אבל רק ${pct(p.ctr)} הקליקו — בערך ${pct(exp)} צפוי במיקום הזה. כ-${int(missed)} הקלקות הולכות לאיבוד.`,
      action: 'לשכתב את כותרת ה-SEO ואת תיאור המטא: שם הדגם והיצרן בהתחלה, מצב המוצר, ויתרון ברור (משלוח, אחריות, מחיר).',
      metrics: [['חשיפות', int(p.impressions)], ['CTR', pct(p.ctr)], ['צפוי', pct(exp)], ['מיקום', pos(p.position)]],
      items: [{ label: p.page, internal: productInternal(p.product) }],
      terms: ['ctr', 'impressions', 'avg-position', 'meta-title'],
      impact: missed * 3,
    })
  }

  // ── חיפוש: כמעט בעמוד הראשון ──────────────────────────────────────────────
  const striking = d.allQueries.filter((q) => q.position !== null && q.position >= T.strikingMinPos && q.position <= T.strikingMaxPos && q.impressions >= T.strikingMinImpressions)
  for (const q of striking.slice(0, 15)) {
    out.push({
      key: `search:striking:${q.query}`,
      rule: 'striking_distance',
      category: 'search',
      severity: q.position! <= 12 ? 'medium' : 'low',
      title: q.position! <= 10 ? `"${q.query}" — בתחתית העמוד הראשון` : `"${q.query}" — קרוב לעמוד הראשון`,
      finding:
        q.position! <= 10
          ? `${int(q.impressions)} חשיפות במיקום ממוצע ${pos(q.position)}. בתחתית העמוד מקליקים מעט; רוב ההקלקות הולכות לשלוש-ארבע התוצאות הראשונות.`
          : `${int(q.impressions)} חשיפות במיקום ממוצע ${pos(q.position)} — העמוד השני בגוגל. בעמוד הראשון (מיקום 1–10) מקבלים את רוב ההקלקות.`,
      action: `לחזק את הדף ${q.page}: להכניס את הביטוי לכותרת ולתיאור, להוסיף מפרט טכני ושאלות נפוצות, ולקשר אליו מדפי קטגוריה ומוצרים דומים.`,
      metrics: [['חשיפות', int(q.impressions)], ['מיקום', pos(q.position)], ['הקלקות', int(q.clicks)]],
      items: [{ label: q.page }],
      terms: ['striking-distance', 'avg-position', 'internal-links'],
      impact: q.impressions * 0.15,
    })
  }

  // ── חיפוש: ביטוי בעלייה ──────────────────────────────────────────────────
  const rising = d.allQueries.filter((q) => q.impressions >= T.risingMinImpressions && q.prevImpressions > 0 && q.impressions >= q.prevImpressions * T.risingFactor)
  if (rising.length) {
    out.push({
      key: 'search:rising',
      rule: 'rising_queries',
      category: 'search',
      severity: 'low',
      title: `${rising.length} ביטויי חיפוש בעלייה`,
      finding: 'הביקוש לביטויים האלה בגוגל לפחות הוכפל לעומת התקופה הקודמת.',
      action: 'לוודא שיש מלאי של המוצרים הרלוונטיים, ולשקול דף קטגוריה או תוכן ייעודי לביטוי.',
      metrics: [['ביטויים', int(rising.length)]],
      items: rising.slice(0, 10).map((q) => ({ label: q.query, sub: `${int(q.prevImpressions)} → ${int(q.impressions)} חשיפות` })),
      terms: ['impressions', 'search-query'],
      impact: rising.reduce((a, q) => a + (q.impressions - q.prevImpressions), 0) * 0.1,
    })
  }

  // ── מלאי: אזל אבל יש תנועה ────────────────────────────────────────────────
  for (const p of d.allPages) {
    const c = p.product
    if (!c) continue
    const out0 = c.stockStatus === 'outofstock' || (c.stockQuantity !== null && c.stockQuantity <= 0) || (c.available !== null && c.available <= 0)
    if (!out0 || (p.views < T.oosMinViews && p.impressions < T.oosMinImpressions)) continue
    out.push({
      key: `stock:oos:${c.wooProductId}`,
      rule: 'out_of_stock_with_traffic',
      category: 'stock',
      severity: p.views >= 50 ? 'high' : 'medium',
      title: `אזל במלאי, ועדיין מחפשים אותו: ${c.name}`,
      finding: `${int(p.views)} צפיות ו-${int(p.impressions)} חשיפות בגוגל ${period}, והמוצר לא זמין לקנייה.`,
      action: 'להשיג מלאי אם אפשר. אם לא — להשאיר את הדף (לא למחוק, כדי לא לאבד דירוג) ולהוסיף בו קישור למוצרים חלופיים.',
      metrics: [['צפיות', int(p.views)], ['חשיפות', int(p.impressions)], ['מלאי', String(c.available ?? c.stockQuantity ?? 0)]],
      items: [{ label: c.sku ? `SKU ${c.sku}` : p.page, internal: productInternal(c) }],
      terms: ['page-views', 'impressions', 'stock-status'],
      impact: p.views * 2 + p.impressions * 0.2,
    })
  }

  // ── מוצרים: צפיות בלי עגלה / עגלה בלי קנייה ───────────────────────────────
  for (const it of d.allItems) {
    if (it.viewed >= T.viewsNoCartMin && it.addedToCart === 0) {
      out.push({
        key: `products:views-no-cart:${it.itemId}`,
        rule: 'views_no_cart',
        category: 'products',
        severity: it.viewed >= 60 ? 'high' : 'medium',
        title: `הרבה צפיות, אף הוספה לעגלה: ${it.name}`,
        finding: `${int(it.viewed)} צפיות בדף המוצר ${period}, ואף לא הוספה אחת לעגלה.`,
        action: 'לבדוק את המחיר מול eBay ומתחרים, את איכות התמונות, שהמפרט והמצב ברורים, ושכפתור הקנייה והמשלוח לחו"ל מוצגים.',
        metrics: [['צפיות', int(it.viewed)], ['לעגלה', '0'], ['מחיר', it.product?.price ? usd(it.product.price) : '—']],
        items: [{ label: it.product?.sku ? `SKU ${it.product.sku}` : it.itemId, internal: productInternal(it.product) }],
        terms: ['item-views', 'add-to-cart', 'cart-rate'],
        impact: it.viewed * 1.5,
      })
    } else if (it.addedToCart >= T.cartNoBuyMin && it.purchased === 0) {
      out.push({
        key: `products:cart-no-buy:${it.itemId}`,
        rule: 'cart_no_purchase',
        category: 'products',
        severity: 'medium',
        title: `נכנס לעגלה ולא נקנה: ${it.name}`,
        finding: `${int(it.addedToCart)} הוספות לעגלה ${period}, בלי אף רכישה.`,
        action: 'לבדוק את עלות המשלוח שמוצגת בקופה למוצר הזה (משקל/מידות), ואם יש מגבלת משלוח למדינות מסוימות.',
        metrics: [['לעגלה', int(it.addedToCart)], ['נקנה', '0'], ['צפיות', int(it.viewed)]],
        items: [{ label: it.product?.sku ? `SKU ${it.product.sku}` : it.itemId, internal: productInternal(it.product) }],
        terms: ['add-to-cart', 'cart-abandonment'],
        impact: it.addedToCart * 15,
      })
    }
  }

  // ── מכירות: נטישה בקופה ──────────────────────────────────────────────────
  if (s.cur.checkouts >= T.checkoutAbandonMinCheckouts && s.cur.checkoutAbandonment !== null && s.cur.checkoutAbandonment > T.checkoutAbandonMax) {
    out.push({
      key: 'sales:checkout-abandon',
      rule: 'checkout_abandonment',
      category: 'sales',
      severity: 'high',
      title: 'רוב מי שמגיע לקופה לא משלים קנייה',
      finding: `${int(s.cur.checkouts)} התחילו תשלום ו-${int(s.cur.purchases)} השלימו — נטישה של ${pct(s.cur.checkoutAbandonment)}.`,
      action: 'לעבור בעצמך על הקופה (גם בנייד): עלויות משלוח ומכס מפתיעות, אמצעי תשלום חסרים, שדות מיותרים, שגיאות.',
      metrics: [['התחילו תשלום', int(s.cur.checkouts)], ['השלימו', int(s.cur.purchases)], ['נטישה', pct(s.cur.checkoutAbandonment)]],
      terms: ['checkout-abandonment', 'checkout', 'conversion-rate'],
      impact: s.cur.checkouts * 20,
    })
  }

  // ── תנועה: ערוץ באיכות נמוכה ──────────────────────────────────────────────
  for (const ch of d.channels) {
    if (ch.sessions < T.lowEngagementMinSessions || ch.engagementRate === null || ch.engagementRate >= T.lowEngagementRate) continue
    out.push({
      key: `traffic:low-engagement:${ch.value}`,
      rule: 'low_engagement_channel',
      category: 'traffic',
      severity: 'medium',
      title: `תנועה באיכות נמוכה מ-${ch.value}`,
      finding: `רק ${pct(ch.engagementRate)} מהביקורים מהערוץ הזה היו מעורבים (${int(ch.sessions)} ביקורים).`,
      action: 'אם זה פרסום ממומן — לדייק את הקהל ואת דף הנחיתה. אם זה Referral/Direct לא מוכר — ייתכן שזו תנועת ספאם או בוטים.',
      metrics: [['ביקורים', int(ch.sessions)], ['מעורבות', pct(ch.engagementRate)], ['רכישות', int(ch.purchases)]],
      terms: ['engagement-rate', 'traffic-channel', 'bounce-rate'],
      impact: ch.sessions * 0.5,
    })
  }

  // ── תנועה: נייד ממיר פחות ────────────────────────────────────────────────
  const mobile = d.devices.find((x) => x.value === 'mobile')
  const desktop = d.devices.find((x) => x.value === 'desktop')
  if (mobile && desktop && mobile.sessions >= T.mobileMinSessions && desktop.conversionRate && mobile.conversionRate !== null && mobile.conversionRate < desktop.conversionRate * T.mobileGapFactor) {
    out.push({
      key: 'traffic:mobile-gap',
      rule: 'mobile_conversion_gap',
      category: 'traffic',
      severity: 'medium',
      title: 'בנייד קונים הרבה פחות מאשר במחשב',
      finding: `שיעור ההמרה בנייד ${pct(mobile.conversionRate)}, במחשב ${pct(desktop.conversionRate)}. ${pct(mobile.share)} מהביקורים הם מהנייד.`,
      action: 'לבדוק את החנות בטלפון: מהירות טעינה, גודל תמונות, כפתור "הוספה לעגלה" נגיש, וקופה קצרה.',
      metrics: [['המרה בנייד', pct(mobile.conversionRate)], ['המרה במחשב', pct(desktop.conversionRate)], ['ביקורים בנייד', int(mobile.sessions)]],
      terms: ['conversion-rate', 'device'],
      impact: mobile.sessions * 0.8,
    })
  }

  // ── שיווק: ROAS מתחת ל-1 ─────────────────────────────────────────────────
  const m = d.marketing.cur
  if (m.totalSpend > 0 && m.roas !== null && m.roas < 1) {
    out.push({
      key: 'marketing:roas',
      rule: 'roas_below_1',
      category: 'marketing',
      severity: 'high',
      title: 'הפרסום מכניס פחות ממה שהוא עולה',
      finding: `הוצאה של ${usd(m.totalSpend)} ${period} מול הכנסות אתר של ${usd(s.cur.revenue)} — ROAS ${m.roas.toFixed(2)}.`,
      action: 'לעצור או לצמצם קמפיינים בלי מכירות, ולהעביר תקציב למוצרים ולביטויים שכבר מוכרים.',
      metrics: [['הוצאה', usd(m.totalSpend)], ['הכנסות', usd(s.cur.revenue)], ['ROAS', m.roas.toFixed(2)], ['ROI', pct(m.roi)]],
      terms: ['roas', 'roi', 'ad-spend'],
      impact: m.totalSpend * 2,
    })
  }

  // ── מוצרים: נמכרים ב-eBay ולא בחנות ──────────────────────────────────────
  if (d.setup.woo && d.ebaySellers.length) {
    const list = d.ebaySellers
    out.push({
      key: 'products:ebay-sellers',
      rule: 'ebay_sellers_not_in_store',
      category: 'products',
      severity: 'medium',
      title: `${list.length} מוצרים נמכרים ב-eBay ועדיין לא בחנות`,
      finding: 'המוצרים האלה נמכרו ב-eBay ב-90 הימים האחרונים ויש להם מלאי — ביקוש מוכח שלא מוצג באתר.',
      action: 'לשלוח אותם לחנות ממסך המוצרים (סימון → "שליחה לחנות").',
      metrics: [['מוצרים', int(list.length)], ['יחידות שנמכרו ב-eBay', int(list.reduce((a, x) => a + x.units, 0))]],
      items: list.slice(0, 10).map((x) => ({ label: x.title, sub: `SKU ${x.sku} · ${int(x.units)} נמכרו · מלאי ${int(x.available)}`, internal: `/sync/products/${x.productId}` })),
      terms: ['sell-through'],
      impact: list.reduce((a, x) => a + x.units, 0) * 10,
    })
  }

  // ── חיפוש: מוצרים שלא מופיעים בגוגל ──────────────────────────────────────
  if (d.setup.gsc && d.setup.gscRange) {
    const seen = new Set(d.allPages.filter((p) => p.impressions > 0).map((p) => p.page))
    const old = now.getTime() - T.noImpressionsMinAgeDays * 86400_000
    const missing = d.catalog.filter((c) => c.status === 'publish' && c.path && !seen.has(c.path) && c.wooCreatedAt && Date.parse(c.wooCreatedAt) < old)
    if (missing.length) {
      out.push({
        key: 'search:no-impressions',
        rule: 'no_impressions',
        category: 'search',
        severity: missing.length >= 20 ? 'medium' : 'low',
        title: `${missing.length} מוצרים לא הופיעו בגוגל אפילו פעם אחת`,
        finding: `מוצרים שפורסמו לפני יותר מ-${T.noImpressionsMinAgeDays} יום, בלי אף חשיפה בחיפוש ${period}.`,
        action: 'לבדוק ב-Search Console ("בדיקת כתובת URL") שהם באינדקס ושמפת האתר כוללת אותם, ולקשר אליהם מדפי קטגוריה.',
        metrics: [['מוצרים', int(missing.length)]],
        items: missing.slice(0, 10).map((c) => ({ label: c.name, sub: c.path ?? undefined, internal: productInternal(c) })),
        terms: ['indexing', 'sitemap', 'impressions'],
        impact: missing.length * 2,
      })
    }
  }

  const sev = { high: 3, medium: 2, low: 1 }
  return out.sort((a, b) => sev[b.severity] - sev[a.severity] || b.impact - a.impact)
}
