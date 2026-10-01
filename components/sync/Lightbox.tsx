'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { ebayFull, ebayThumb } from './images'
import { Modal, Spin } from './ui'

/**
 * צפייה בתמונה בגודל מלא: לחיצה על תמונה ממוזערת פותחת אותה בדיאלוג, עם מעבר בין התמונות
 * (כפתורים, חיצי המקלדת, החלקה בטלפון). Esc או לחיצה מחוץ סוגרים — דרך Modal.
 */
export function Lightbox({ images, index, title, onClose }: { images: string[]; index: number; title?: string; onClose: () => void }) {
  const [i, setI] = useState(index)
  const [loaded, setLoaded] = useState(false)
  const [fallback, setFallback] = useState(false)
  const touchX = useRef<number | null>(null)
  const n = images.length
  const src = images[i]
  const go = (d: number) => setI((x) => (x + d + n) % n)

  useEffect(() => {
    setLoaded(false)
    setFallback(false)
  }, [i])

  useEffect(() => {
    if (n < 2) return
    // ממשק מימין לשמאל: חץ שמאלה = הבאה, חץ ימינה = הקודמת
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(1)
      else if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  return (
    <Modal
      title={n > 1 ? `תמונה ${i + 1} מתוך ${n}` : 'תמונה'}
      onClose={onClose}
      maxWidth={1100}
      foot={
        <>
          <a className="ax-btn is-ghost" href={ebayFull(src)} target="_blank" rel="noopener noreferrer" style={{ marginInlineEnd: 'auto' }}>
            <ExternalLink size={16} aria-hidden="true" />
            פתיחה בחלון חדש<span className="ax-sr"> (נפתח בחלון חדש)</span>
          </a>
          {n > 1 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="ax-btn" onClick={() => go(-1)}>
                <ChevronRight size={18} aria-hidden="true" />
                הקודמת
              </button>
              <button type="button" className="ax-btn" onClick={() => go(1)}>
                הבאה
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      }
    >
      {title && (
        <p className="ax-muted" dir="ltr" style={{ margin: '-8px 0 0', fontSize: 13, textAlign: 'right', unicodeBidi: 'isolate' }}>
          {title}
        </p>
      )}
      <div
        className="ax-inner"
        style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 240, overflow: 'hidden' }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null || n < 2) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          // החלקה ימינה = הבאה (כמו דפדוף בספר בעברית)
          if (Math.abs(dx) > 50) go(dx > 0 ? 1 : -1)
        }}
      >
        {!loaded && (
          <span style={{ position: 'absolute' }} aria-hidden="true">
            <Spin size={24} />
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={fallback ? src : ebayFull(src)}
          alt={`תמונה ${i + 1}${title ? ` של ${title}` : ''}`}
          onLoad={() => setLoaded(true)}
          onError={() => (fallback ? setLoaded(true) : setFallback(true))}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 'min(72vh, 1000px)', objectFit: 'contain', opacity: loaded ? 1 : 0 }}
        />
      </div>
    </Modal>
  )
}

/** תמונה ממוזערת שלחיצה עליה פותחת את Lightbox. images + index = כל התמונות שאפשר לדפדף ביניהן. */
export function ZoomThumb({ images, index = 0, title, size, alt, thumb = true, style }: { images: string[]; index?: number; title?: string; size: number; alt: string; thumb?: boolean; style?: CSSProperties }) {
  const [open, setOpen] = useState(false)
  const src = images[index]
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={`הגדלת ${alt}`}
        style={{ padding: 0, border: 0, background: 'none', borderRadius: 12, cursor: 'zoom-in', flexShrink: 0, lineHeight: 0, ...style }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb ? ebayThumb(src) : src} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover', boxShadow: 'var(--ax-ring)' }} />
      </button>
      {open && <LightboxPortal images={images} index={index} title={title} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * הדיאלוג נפתח בשורש הממשק (.app-ui) ולא בתוך הכרטיס: כרטיס עם backdrop-filter "כולא" position:fixed בתוכו.
 * אירועי React עוברים גם דרך portal — לכן עוצרים לחיצות, כדי שלחיצה בדיאלוג לא תפעיל לחיצה על שורת הטבלה.
 * מקשים לא עוצרים: העצירה נוגעת גם ב-window, ושם Esc והחיצים.
 */
export function LightboxPortal(props: { images: string[]; index: number; title?: string; onClose: () => void }) {
  const root = typeof document !== 'undefined' ? (document.querySelector('.app-ui') as HTMLElement | null) ?? document.body : null
  if (!root) return null
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return createPortal(
    <div onClick={stop} onMouseDown={stop}>
      <Lightbox {...props} />
    </div>,
    root,
  )
}
