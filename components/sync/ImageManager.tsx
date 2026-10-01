'use client'

import { ArrowLeft, ArrowRight, ImagePlus, Star, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@/lib/products/manual-shared'
import { bytes } from './format'
import { Pill, Spin } from './ui'

export interface UploadedImage {
  id: string
  url: string
  fileName: string
  width: number | null
  height: number | null
  size: number
}

const MAX_SIDE = 2400
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** יעד אחרי דחיסה — מתחת למגבלת גודל הבקשה הנפוצה ב-nginx (1MB) */
const TARGET_BYTES = 950 * 1024

/** הקטנה בדפדפן: צד ארוך עד 2400px, WebP (או JPEG כשהדפדפן לא מקודד WebP). קובץ קטן מספיק נשלח כמו שהוא. */
async function prepare(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const width = Math.round(bmp.width * scale)
  const height = Math.round(bmp.height * scale)
  if (scale === 1 && file.size <= TARGET_BYTES && file.type !== 'image/png') {
    bmp.close()
    return { blob: file, width, height }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q))
  const webp = (await toBlob('image/webp', 0.88))?.type === 'image/webp'
  const type = webp ? 'image/webp' : 'image/jpeg'
  // איכות יורדת בהדרגה עד שהקובץ מתחת ליעד
  let blob: Blob | null = null
  for (const q of [0.88, 0.8, 0.72, 0.64, 0.55]) {
    blob = await toBlob(type, q)
    if (blob && blob.size <= TARGET_BYTES) break
  }
  if (!blob) throw new Error('לא הצלחנו לעבד את התמונה')
  return { blob, width, height }
}

async function upload(file: File): Promise<UploadedImage> {
  const { blob, width, height } = await prepare(file)
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: גדול מדי גם אחרי דחיסה`)
  const fd = new FormData()
  fd.append('file', blob, file.name)
  fd.append('name', file.name)
  fd.append('width', String(width))
  fd.append('height', String(height))
  const res = await fetch('/api/sync/media', { method: 'POST', body: fd, credentials: 'same-origin' })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `שגיאה ${res.status} בהעלאה`)
  return data as UploadedImage
}

/**
 * תמונות המוצר: הראשונה היא התמונה הראשית (גדולה), השאר גלריה.
 * העלאה בגרירה או בבחירה, סידור בגרירה או בכפתורי חצים, "הפוך לראשית", הסרה.
 */
export function ImageManager({ images, onChange, onError, error, titleForAlt }: { images: UploadedImage[]; onChange: (next: UploadedImage[]) => void; onError: (msg: string) => void; error?: string; titleForAlt: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(0)
  const [over, setOver] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const latest = useRef(images)
  latest.current = images

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => TYPES.includes(f.type))
    const rejected = Array.from(list).length - files.length
    if (rejected) onError('אפשר להעלות רק JPG, PNG או WebP')
    const room = MAX_IMAGES - latest.current.length - pending
    if (files.length > room) onError(`עד ${MAX_IMAGES} תמונות למוצר — ${files.length - Math.max(room, 0)} לא הועלו`)
    const take = files.slice(0, Math.max(room, 0))
    if (!take.length) return
    setPending((n) => n + take.length)
    for (const f of take) {
      try {
        const img = await upload(f)
        onChange([...latest.current, img])
        latest.current = [...latest.current, img]
      } catch (e) {
        onError(e instanceof Error ? e.message : 'ההעלאה נכשלה')
      } finally {
        setPending((n) => n - 1)
      }
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return
    const next = [...images]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    onChange(next)
  }

  return (
    <div className="ax-pf-stack">
      {(images.length > 0 || pending > 0) && (
        <ul className="ax-pf-images" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="תמונות המוצר — הראשונה היא התמונה הראשית">
          {images.map((img, i) => (
            <li
              key={img.id}
              className={'ax-pf-img' + (i === 0 ? ' is-main' : '') + (drag === i ? ' is-drag' : '') + (target === i && drag !== i ? ' is-target' : '')}
              draggable
              onDragStart={(e) => {
                setDrag(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (drag === null) return
                e.preventDefault()
                setTarget(i)
              }}
              onDragLeave={() => setTarget(null)}
              onDrop={(e) => {
                e.preventDefault()
                if (drag !== null) move(drag, i)
                setDrag(null)
                setTarget(null)
              }}
              onDragEnd={() => (setDrag(null), setTarget(null))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={i === 0 ? `תמונה ראשית — ${titleForAlt || 'מוצר'}` : `תמונה ${i + 1} — ${titleForAlt || 'מוצר'}`} loading="lazy" draggable={false} />
              {i === 0 && <Pill t="accent">ראשית</Pill>}
              <div className="ax-pf-img-tools">
                {i > 0 && (
                  <>
                    <button type="button" className="ax-btn is-icon is-sm" aria-label={`תמונה ${i + 1}: הפוך לראשית`} title="הפוך לראשית" onClick={() => move(i, 0)}>
                      <Star size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className="ax-btn is-icon is-sm" aria-label={`תמונה ${i + 1}: הזזה קדימה`} title="הזזה קדימה" onClick={() => move(i, i - 1)}>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
                {i < images.length - 1 && (
                  <button type="button" className="ax-btn is-icon is-sm" aria-label={`תמונה ${i + 1}: הזזה אחורה`} title="הזזה אחורה" onClick={() => move(i, i + 1)}>
                    <ArrowLeft size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="ax-btn is-icon is-sm"
                  aria-label={`הסרת תמונה ${i + 1}`}
                  title="הסרה"
                  onClick={() => {
                    onChange(images.filter((x) => x.id !== img.id))
                    // תמונה מטופס שעוד לא נשמר נמחקת מיד מהחנות; של מוצר שמור — רק בשמירה (השרת מחליט)
                    void fetch(`/api/sync/media/${img.id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <li key={`p${i}`} className={'ax-pf-img is-pending' + (images.length === 0 && i === 0 ? ' is-main' : '')}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                <Spin size={20} />
                מעלה…
              </span>
            </li>
          ))}
        </ul>
      )}

      {images.length + pending < MAX_IMAGES && (
        <label
          className={'ax-pf-drop' + (over ? ' is-over' : '')}
          onDragOver={(e) => {
            if (drag !== null) return
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            if (drag !== null) return
            e.preventDefault()
            setOver(false)
            void addFiles(e.dataTransfer.files)
          }}
        >
          <span className="ax-tile" aria-hidden="true">
            <ImagePlus size={20} />
          </span>
          <span style={{ fontWeight: 600, color: 'var(--ax-text)' }}>{images.length ? 'הוספת תמונות לגלריה' : 'העלאת תמונה ראשית וגלריה'}</span>
          <span className="ax-hint">
            גוררים לכאן או לוחצים לבחירה · JPG, PNG, WebP · עד {MAX_IMAGES} תמונות · מוקטנות ל-{MAX_SIDE}px ועולות ישר לספריית המדיה של החנות
          </span>
          <input
            ref={input}
            type="file"
            accept={TYPES.join(',')}
            multiple
            className="ax-sr"
            aria-describedby={error ? 'images-err' : undefined}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      )}
      {error && (
        <span id="images-err" className="ax-hint" style={{ color: 'var(--ax-bad)' }}>
          {error}
        </span>
      )}
      {images.length > 0 && (
        <span className="ax-hint">
          <span className="ax-num">{images.length}</span> תמונות · <bdi className="ax-num" dir="ltr">{bytes(images.reduce((s, x) => s + x.size, 0))}</bdi> · גוררים כדי לסדר; הראשונה היא התמונה הראשית בחנות
        </span>
      )}
    </div>
  )
}
