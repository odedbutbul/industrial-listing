import type { Metadata } from 'next'

// דף פרטיות פומבי — נדרש ע"י eBay ל-RuName (Your privacy policy URL). בלי התחברות (ראה PUBLIC_PATHS ב-middleware).

export const metadata: Metadata = {
  title: 'מדיניות פרטיות — סנכרון מלאי',
  robots: { index: true, follow: false },
}

const UPDATED = '29.9.2026'
const CONTACT = 'info@yp-ts.com'

export default function PrivacyPage() {
  return (
    <main className="ax-main is-narrow">
      <section className="ax-section">
        <div>
          <h1 className="ax-h1">מדיניות פרטיות</h1>
          <p className="ax-sub">מערכת סנכרון מלאי של י.פ. פתרונות טכניים · עודכן {UPDATED}</p>
        </div>

        <article className="ax-card ax-card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, lineHeight: 1.7 }}>
          <h2 className="ax-h2">מה המערכת עושה</h2>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            זו מערכת פנימית של העסק, שמסנכרנת את המלאי בין חשבון ה-eBay של העסק לבין החנות המקוונת שלו. אין בה משתמשים מהציבור, והגישה אליה מוגבלת לעסק בלבד.
          </p>

          <h2 className="ax-h2">אילו נתונים נקראים מ-eBay</h2>
          <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--ax-text2)' }}>
            <li>פרטי המודעות של העסק: כותרת, תיאור, תמונות, מחיר, מק״ט (SKU), קטגוריה, מצב וכמות.</li>
            <li>פרטי הזמנות שנמכרו דרך eBay, לצורך עדכון המלאי: מספר הזמנה, הפריטים, הכמויות וסטטוס ההזמנה.</li>
            <li>אסימון גישה (OAuth token) שמאפשר למערכת לקרוא את הנתונים האלה בשם העסק.</li>
          </ul>

          <h2 className="ax-h2">למה הנתונים משמשים</h2>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>אך ורק לסנכרון המלאי ולתיעוד פעולות הסנכרון. הנתונים לא משמשים לשיווק, לא נמכרים ולא מועברים לצד שלישי.</p>

          <h2 className="ax-h2">איפה הנתונים נשמרים</h2>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>בשרת ייעודי של העסק באיחוד האירופי. אסימוני הגישה של eBay נשמרים מוצפנים. הגישה לשרת ולמערכת מוגבלת לעסק ולמי שמתחזק אותה עבורו.</p>

          <h2 className="ax-h2">כמה זמן הנתונים נשמרים</h2>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>כל עוד המערכת בשימוש. ניתוק החיבור ל-eBay מבטל את גישת המערכת לחשבון, ולבקשת העסק הנתונים נמחקים.</p>

          <h2 className="ax-h2">יצירת קשר</h2>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            שאלות על המדיניות הזו:{' '}
            <a href={`mailto:${CONTACT}`} className="ax-ltr">
              {CONTACT}
            </a>
          </p>
        </article>

        <article className="ax-card ax-card-pad" dir="ltr" lang="en" style={{ display: 'flex', flexDirection: 'column', gap: 12, lineHeight: 1.7, textAlign: 'left' }}>
          <h2 className="ax-h2">Privacy Policy (English)</h2>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            This is an internal inventory-sync system operated by Y.P. Technical Solutions (י.פ. פתרונות טכניים) for its own eBay seller account and online store. It has no public users. Last updated{' '}
            {UPDATED}.
          </p>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            <b>Data read from eBay:</b> the business&apos;s own listings (title, description, images, price, SKU, category, condition, quantity), details of orders sold on eBay needed to update stock
            (order ID, items, quantities, order status), and the OAuth access token that authorises this access.
          </p>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            <b>Use:</b> solely to keep stock levels in sync and to log sync operations. Data is not used for marketing, not sold and not shared with third parties.
          </p>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            <b>Storage:</b> on a dedicated server in the European Union; eBay access tokens are stored encrypted. Access is limited to the business and its maintainer.
          </p>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            <b>Retention:</b> for as long as the system is in use. Disconnecting eBay revokes access; data is deleted on the business&apos;s request.
          </p>
          <p style={{ margin: 0, color: 'var(--ax-text2)' }}>
            <b>Contact:</b> <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </article>
      </section>
    </main>
  )
}
