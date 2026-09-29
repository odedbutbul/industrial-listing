'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { GLOSSARY, GLOSSARY_GROUPS } from '@/components/sync/glossary'

// מילון המונחים של מסך התובנות. כל מדד במסך מקשר לכאן עם #id.

export default function GlossaryPage() {
  const [q, setQ] = useState('')
  const [hash, setHash] = useState('')

  useEffect(() => {
    const on = () => setHash(decodeURIComponent(window.location.hash.slice(1)))
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash)?.scrollIntoView({ block: 'start' })
  }, [hash])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return GLOSSARY
    return GLOSSARY.filter((t) => [t.term, t.en, t.def, t.formula].some((v) => v?.toLowerCase().includes(s)))
  }, [q])

  return (
    <>
      <Link href="/sync/insights" className="ax-back">
        <ArrowRight size={16} aria-hidden="true" />
        חזרה לתובנות
      </Link>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">מילון מונחים</h1>
          <p className="ax-sub">{GLOSSARY.length} מונחים שכל מנהל חנות צריך להכיר — מה כל מספר אומר ואיך מחשבים אותו</p>
        </div>
      </div>

      <div className="ax-search" role="search" style={{ maxWidth: 420 }}>
        <Search size={18} aria-hidden="true" />
        <input type="search" className="ax-input" aria-label="חיפוש מונח" placeholder="חיפוש: ROI, נטישה, CTR…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <nav aria-label="נושאים" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {GLOSSARY_GROUPS.map(([g, label]) => (
          <a key={g} href={`#group-${g}`} className="ax-btn is-sm is-ghost">
            {label}
          </a>
        ))}
      </nav>

      {filtered.length === 0 && (
        <div className="ax-card">
          <p className="ax-note">לא נמצא מונח שמתאים לחיפוש.</p>
        </div>
      )}

      {GLOSSARY_GROUPS.map(([g, label]) => {
        const terms = filtered.filter((t) => t.group === g)
        if (!terms.length) return null
        return (
          <section key={g} id={`group-${g}`} className="ax-card" aria-labelledby={`gh-${g}`} style={{ scrollMarginTop: 88 }}>
            <div className="ax-card-head">
              <h2 id={`gh-${g}`} className="ax-h2">
                {label}
              </h2>
            </div>
            <dl style={{ margin: 0 }}>
              {terms.map((t) => (
                <div
                  key={t.id}
                  id={t.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--ax-line)',
                    scrollMarginTop: 88,
                    background: hash === t.id ? 'var(--ax-tint)' : undefined,
                    boxShadow: hash === t.id ? 'inset 0 0 0 1px var(--ax-tint-ring)' : undefined,
                  }}
                >
                  <dt style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'Rubik, Heebo, sans-serif', fontWeight: 600, fontSize: 16 }}>{t.term}</span>
                    {t.en && (
                      <span className="ax-muted ax-ltr" dir="ltr" style={{ fontSize: 13 }}>
                        {t.en}
                      </span>
                    )}
                  </dt>
                  <dd style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span>{t.def}</span>
                    {t.formula && (
                      <span style={{ fontSize: 13.5 }}>
                        <span className="ax-muted">חישוב: </span>
                        <span style={{ fontWeight: 600 }}>{t.formula}</span>
                      </span>
                    )}
                    {t.read && (
                      <span style={{ fontSize: 13.5, color: 'var(--ax-text2)' }}>
                        <span className="ax-muted">איך לקרוא: </span>
                        {t.read}
                      </span>
                    )}
                    {t.source && (
                      <span className="ax-muted" style={{ fontSize: 12.5 }}>
                        מקור: {t.source}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )
      })}
      <p className="ax-hint" style={{ margin: 0 }}>
        הטווחים שמופיעים כאן הם הערכה כללית לחנויות אונליין ומשתנים מאוד לפי תחום ומחיר. המגמה אצלך (עלייה / ירידה מול התקופה הקודמת) חשובה יותר ממספר יעד.
      </p>
    </>
  )
}
