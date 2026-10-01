'use client'

import './product-form.css'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Plus, Save, Store, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CONDITIONS,
  COUNTRY_CODES,
  countryName,
  emptyManualProduct,
  MAX_FAQ,
  SHIP_REGIONS,
  storeBlockers,
  validateManualProduct,
  type FieldErrors,
  type ManualProductInput,
  type ShipInput,
  type ShipMode,
} from '@/lib/products/manual-shared'
import { api, ApiError } from './api'
import { ago, num } from './format'
import { ImageManager, type UploadedImage } from './ImageManager'
import { ZoomThumb } from './Lightbox'
import { MultiCombobox, type ComboOption } from './MultiCombobox'
import { RichTextEditor } from './RichTextEditor'
import { Field, LoadError, Pill, Seg, Spin, StatusMark, Switch, useLoad, useToast } from './ui'
import { WooLink } from './WooLink'

export interface ManualProductData {
  input: ManualProductInput
  available: number
  images: UploadedImage[]
  wooProductId: number | null
  lastSyncedAt: string | null
  updatedAt: string
}

interface Options {
  categories: { slug: string; name: string; parent: string | null }[]
  tags: string[]
  sku: string
}

/** שמות המדינות באנגלית, לפי א-ב (כמו ב-eBay) */
const countries = COUNTRY_CODES.map(countryName).sort((a, b) => a.localeCompare(b, 'en'))

/** "לא שולחים אל": אזורים של eBay + מדינות לפי קוד (מה שה-theme מזהה) */
const EXCLUDE_OPTIONS: ComboOption[] = [
  ...SHIP_REGIONS.map((r) => ({ value: r, meta: 'אזור' })),
  ...COUNTRY_CODES.map((c) => ({ value: c, meta: countryName(c) })).sort((a, b) => a.meta.localeCompare(b.meta, 'en')),
]

/** חיפוש מותגים בשרת */
const searchBrands = async (q: string): Promise<ComboOption[]> =>
  (await api.get<{ brands: { name: string; count: number }[] }>(`/api/sync/products/manual/brands?q=${encodeURIComponent(q)}`)).brands.map((b) => ({ value: b.name, meta: `${b.count} מוצרים` }))

type StoreResult = { action: 'created' | 'updated'; wooProductId: number; images: number }

/** מוצר ידני: יצירה (בלי productId) או עריכה. נשמר במערכת; שליחה לחנות — רק בכפתור. */
export function ManualProductForm({ productId, initial, onSaved }: { productId?: string; initial?: ManualProductData; onSaved?: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const options = useLoad(() => api.get<Options>('/api/sync/products/manual/options'), [])

  const start = initial?.input ?? emptyManualProduct()
  const [form, setForm] = useState<ManualProductInput>(start)
  const [images, setImages] = useState<UploadedImage[]>(initial?.images ?? [])
  const [saved, setSaved] = useState(() => JSON.stringify({ ...start, imageIds: (initial?.images ?? []).map((i) => i.id) }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState<'save' | 'send' | null>(null)
  const [storeError, setStoreError] = useState('')
  const [saleSchedule, setSaleSchedule] = useState(!!(start.saleFrom || start.saleTo))

  // SKU מוצע למוצר חדש — רק אם המשתמש עוד לא הקליד
  useEffect(() => {
    if (!productId && options.data && !form.sku) {
      setForm((f) => ({ ...f, sku: options.data!.sku }))
      setSaved((s) => JSON.stringify({ ...JSON.parse(s), sku: options.data!.sku }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.data])

  const tagOptions = useMemo(() => (options.data?.tags ?? []).map((t) => ({ value: t })), [options.data])
  const payload = useMemo(() => ({ ...form, imageIds: images.map((i) => i.id) }), [form, images])
  const dirty = JSON.stringify(payload) !== saved
  const blockers = storeBlockers(payload)
  const inStore = !!initial?.wooProductId

  // יציאה מהדף עם שינויים שלא נשמרו
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const clearError = (...keys: string[]) => setErrors((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !keys.includes(k))))
  const set = <K extends keyof ManualProductInput>(k: K, v: ManualProductInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k as string]) clearError(k as string)
  }
  const setShip = (side: 'us' | 'intl', v: Partial<ShipInput>) => {
    setForm((f) => ({ ...f, shipping: { ...f.shipping, [side]: { ...f.shipping[side], ...v } } }))
    setErrors((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !k.startsWith(`ship_${side}_`))))
  }
  const setSpec = (k: keyof ManualProductInput['specs'], v: string) => {
    setForm((f) => ({ ...f, specs: { ...f.specs, [k]: v } }))
    if (errors[`spec_${k}`]) clearError(`spec_${k}`)
  }
  const setDim = (k: keyof ManualProductInput['dims'], v: string) => {
    setForm((f) => ({ ...f, dims: { ...f.dims, [k]: v } }))
    if (errors[`dims_${k}`]) clearError(`dims_${k}`)
  }

  /** props לשדה: id + חיבור לשגיאה/רמז */
  const fp = (id: string, hint = false) => ({
    id,
    'aria-invalid': errors[id] ? (true as const) : undefined,
    'aria-describedby': errors[id] ? `${id}-err` : hint ? `${id}-hint` : undefined,
  })

  const focusFirstError = (errs: FieldErrors) => {
    const first = Object.keys(errs)[0]
    if (!first) return
    // השדה הראשון המסומן בטופס (לפי סדר הדף); תמונות — אזור ההעלאה
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>('.ax-pf-layout [aria-invalid="true"]') ?? document.getElementById(first === 'images' ? 'images-drop' : first)
      el?.focus()
      el?.scrollIntoView({ block: 'center' })
    }, 0)
  }

  const submit = async (send: boolean) => {
    setStoreError('')
    const errs = validateManualProduct(payload)
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast('יש שדות שצריך לתקן — מסומנים באדום', 'bad')
      focusFirstError(errs)
      return
    }
    setBusy(send ? 'send' : 'save')
    let id = productId
    try {
      if (!id) id = (await api.post<{ id: string }>('/api/sync/products/manual', payload)).id
      else await api.post(`/api/sync/products/${id}/manual`, { product: payload, expectedAvailable: initial!.available })
      setSaved(JSON.stringify(payload))
      setErrors({})
    } catch (e) {
      const fields = e instanceof ApiError ? ((e.data as { fields?: FieldErrors } | null)?.fields ?? {}) : {}
      setErrors(fields)
      focusFirstError(fields)
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'bad')
      setBusy(null)
      return
    }

    if (send) {
      try {
        const r = await api.post<StoreResult>(`/api/sync/products/${id}/store`)
        toast(r.action === 'created' ? `נשמר ונוצר בחנות כטיוטה (#${r.wooProductId})` : `נשמר ועודכן בחנות (#${r.wooProductId})`)
      } catch (e) {
        const msg = `נשמר במערכת, אבל השליחה לחנות נכשלה: ${e instanceof Error ? e.message : 'שגיאה'}`
        setStoreError(msg)
        toast(msg, 'bad')
      }
    } else toast('המוצר נשמר במערכת')
    setBusy(null)
    if (!productId) router.replace(`/sync/products/${id}`)
    else onSaved?.()
  }

  const title = productId ? form.title || 'מוצר ידני' : 'העלאת מוצר'

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/sync/products" className="ax-back">
          <ArrowRight size={16} aria-hidden="true" />
          מוצרים
        </Link>
        <div className="ax-page-head">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="ax-h1" style={{ overflowWrap: 'anywhere' }}>
                {title}
              </h1>
              <Pill t="violet">ידני</Pill>
            </div>
            <p className="ax-sub">
              {!productId
                ? 'מוצר לחנות בלבד — לא קשור ל-eBay. נשמר במערכת, ונשלח לחנות כטיוטה רק כשלוחצים.'
                : inStore
                  ? `בחנות · מלאי ${num(initial!.available)}${initial!.lastSyncedAt ? ` · עודכן בחנות ${ago(initial!.lastSyncedAt)}` : ''}`
                  : `נשמר במערכת · מלאי ${num(initial!.available)} · עוד לא נשלח לחנות`}
            </p>
          </div>
        </div>
      </div>

      <div className="ax-pf-layout">
        {/* ── עמודת תוכן ── */}
        <div className="ax-pf-col">
          <Section title="פרטים בסיסיים">
            <Field id="title" label="שם המוצר" error={errors.title} hint="באנגלית, כפי שיופיע בחנות">
              <input {...fp('title', true)} className="ax-input" dir="ltr" lang="en" maxLength={200} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Allen-Bradley 1756-L71 ControlLogix Processor" />
            </Field>
            <Field id="shortDescription" label="תיאור קצר" error={errors.shortDescription} hint="מופיע ליד המחיר בעמוד המוצר. 1–3 משפטים">
              <textarea {...fp('shortDescription', true)} className="ax-textarea" dir="ltr" lang="en" rows={3} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
            </Field>
          </Section>

          <Section title="תיאור מלא" aside={<span className="ax-hint">כותרות, רשימות, טבלת מפרט, קישורים</span>}>
            <div className="ax-field">
              <span className="ax-label" id="description-label">
                תיאור המוצר
              </span>
              <RichTextEditor id="description" label="תיאור המוצר" value={form.description} onChange={(v) => set('description', v)} placeholder="Write the full product description…" />
            </div>
          </Section>

          <Section title="תמונות" aside={<span className="ax-hint">ראשית + גלריה</span>}>
            <div id="images-drop" tabIndex={-1} style={{ outline: 'none' }}>
              <ImageManager images={images} onChange={(next) => (setImages(next), clearError('images'))} onError={(m) => toast(m, 'bad')} error={errors.images} titleForAlt={form.title} />
            </div>
            <ImageAlts images={images} value={form.imageAlts} title={form.title} onChange={(v) => set('imageAlts', v)} />
          </Section>

          <Section title="מאפיינים">
            <div className="ax-grid-2">
              <MultiCombobox
                id="brands"
                label="מותג"
                value={form.brands}
                onChange={(v) => set('brands', v)}
                source={searchBrands}
                create={(t) => t.trim().replace(/\s+/g, ' ').slice(0, 100) || null}
                createLabel="מותג חדש"
                max={5}
                firstBadge="ראשי"
                error={errors.brands}
                hint="מחפשים מותג קיים; מותג שלא קיים ייווצר בחנות. הראשון הוא המותג הראשי"
                placeholder="חיפוש מותג…"
              />
              <Field id="mpn" label="מק״ט יצרן (MPN)" error={errors.mpn}>
                <input {...fp('mpn')} className="ax-input ax-num" dir="ltr" value={form.mpn} onChange={(e) => set('mpn', e.target.value)} autoComplete="off" />
              </Field>
              <Field id="conditionId" label="מצב">
                <select id="conditionId" className="ax-select" value={form.conditionId} onChange={(e) => set('conditionId', e.target.value)}>
                  <option value="">לא צוין</option>
                  {CONDITIONS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="conditionNotes" label="הערות על המצב" hint="לא חובה. למשל: Tested, minor scratches">
                <input {...fp('conditionNotes', true)} className="ax-input" dir="ltr" value={form.conditionNotes} onChange={(e) => set('conditionNotes', e.target.value)} />
              </Field>
            </div>
            <div className="ax-grid-2">
              <Field id="spec_model" label="Model" error={errors.spec_model} hint="לרוב כמו ה-MPN או מספר הדגם על התווית">
                <input {...fp('spec_model', true)} className="ax-input ax-num" dir="ltr" value={form.specs.model} onChange={(e) => setSpec('model', e.target.value)} autoComplete="off" />
              </Field>
              <Field id="spec_countryOfOrigin" label="Country of Origin" error={errors.spec_countryOfOrigin}>
                <select {...fp('spec_countryOfOrigin')} className="ax-select" value={form.specs.countryOfOrigin} onChange={(e) => setSpec('countryOfOrigin', e.target.value)}>
                  <option value="">לא ידוע</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="spec_type" label="Type" error={errors.spec_type} hint="למשל External Tape Drive">
                <input {...fp('spec_type', true)} className="ax-input" dir="ltr" value={form.specs.type} onChange={(e) => setSpec('type', e.target.value)} autoComplete="off" />
              </Field>
              <Field id="spec_expirationDate" label="Expiration Date" error={errors.spec_expirationDate} hint="לפריטים סטריליים / עם תוקף">
                <input {...fp('spec_expirationDate', true)} type="month" className="ax-input ax-num" value={form.specs.expirationDate} onChange={(e) => setSpec('expirationDate', e.target.value)} />
              </Field>
            </div>
            <span className="ax-hint">שדות שלא מולאו לא מוצגים בטבלת המפרט בחנות. שאר המפרט הטכני — בתיאור המלא.</span>
          </Section>

          <Section title="שאלות ותשובות" aside={<span className="ax-hint">עד {MAX_FAQ}</span>}>
            <Faq value={form.faq} errors={errors} onChange={(v) => set('faq', v)} />
          </Section>

        </div>

        {/* ── עמודת צד ── */}
        <div className="ax-pf-col">
          <Section title="מחיר">
            <div className="ax-grid-2">
              <Field id="price" label="מחיר רגיל (USD)" error={errors.price}>
                <input {...fp('price')} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value.trim())} placeholder="0.00" />
              </Field>
              <Field id="salePrice" label="מחיר מבצע" error={errors.salePrice}>
                <input {...fp('salePrice')} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value.trim())} placeholder="לא חובה" />
              </Field>
            </div>
            {form.salePrice && (
              <Switch
                on={saleSchedule}
                onChange={(v) => {
                  setSaleSchedule(v)
                  if (!v) setForm((f) => ({ ...f, saleFrom: '', saleTo: '' }))
                }}
              >
                תזמון המבצע
              </Switch>
            )}
            {form.salePrice && saleSchedule && (
              <div className="ax-grid-2">
                <Field id="saleFrom" label="מתאריך" error={errors.saleFrom}>
                  <input {...fp('saleFrom')} type="date" className="ax-input ax-num" value={form.saleFrom} onChange={(e) => set('saleFrom', e.target.value)} />
                </Field>
                <Field id="saleTo" label="עד תאריך" error={errors.saleTo}>
                  <input {...fp('saleTo')} type="date" className="ax-input ax-num" value={form.saleTo} onChange={(e) => set('saleTo', e.target.value)} />
                </Field>
              </div>
            )}
          </Section>

          <Section title="מלאי">
            <Field id="sku" label="SKU" error={errors.sku} hint={inStore ? 'המוצר כבר בחנות — ה-SKU נעול' : 'מזהה ייחודי. לא מוצג באתר'}>
              <input {...fp('sku', true)} className="ax-input ax-num" dir="ltr" value={form.sku} readOnly={inStore} onChange={(e) => set('sku', e.target.value.trim())} autoComplete="off" />
            </Field>
            <Field id="quantity" label="כמות במלאי" error={errors.quantity} hint={productId ? 'שינוי כאן נרשם בהיסטוריית המלאי כתיקון ידני' : 'רוב הפריטים — יחידה אחת'}>
              <input
                {...fp('quantity', true)}
                type="number"
                min={0}
                step={1}
                className="ax-input ax-num"
                dir="ltr"
                value={Number.isNaN(form.quantity) ? '' : form.quantity}
                onChange={(e) => set('quantity', e.target.value === '' ? NaN : Number(e.target.value))}
              />
            </Field>
          </Section>

          <Section title="משלוח" aside={<span className="ax-hint">לפריט, USD</span>}>
            <ShipFields side="us" label="לארה״ב" value={form.shipping.us} errors={errors} onChange={(v) => setShip('us', v)} fp={fp} />
            <ShipFields side="intl" label="לשאר העולם" value={form.shipping.intl} errors={errors} onChange={(v) => setShip('intl', v)} fp={fp} />
            {form.shipping.intl.mode !== 'none' && (
              <MultiCombobox
                id="ship_exclude"
                label="לא שולחים אל"
                tone="warn"
                max={100}
                value={form.shipping.exclude}
                source={EXCLUDE_OPTIONS}
                onChange={(exclude) => {
                  setForm((f) => ({ ...f, shipping: { ...f.shipping, exclude } }))
                  clearError('ship_exclude')
                }}
                error={errors.ship_exclude}
                hint="מדינה או אזור. קונה משם יקבל בקופה ״צור קשר להצעת משלוח״."
                placeholder="חיפוש מדינה או אזור…"
              />
            )}
            <span className="ax-hint">בקופה הקונה בוחר בין Standard ל-Express. נשמר באותם שדות כמו מוצרי eBay, כך שהמשלוח באתר מחושב אותו דבר.</span>
          </Section>

          <Section title="קטגוריות ותגיות">
            {options.error ? (
              <LoadError error={options.error} retry={options.reload} />
            ) : !options.data ? (
              <div className="ax-skel" style={{ height: 160 }} />
            ) : (
              <>
                <Categories
                  all={options.data.categories}
                  value={form.categorySlugs}
                  onChange={(v) => setForm((f) => ({ ...f, categorySlugs: v, primaryCategory: v.includes(f.primaryCategory) ? f.primaryCategory : '' }))}
                />
                {form.categorySlugs.length > 1 && (
                  <Field id="primaryCategory" label="קטגוריה ראשית" hint="מופיעה בפירורי הלחם ובכתובת. ריק = הראשונה שאינה קטגוריית-אב" error={errors.primaryCategory}>
                    <select id="primaryCategory" className="ax-select" value={form.primaryCategory} onChange={(e) => set('primaryCategory', e.target.value)} aria-describedby="primaryCategory-hint">
                      <option value="">אוטומטית</option>
                      {form.categorySlugs.map((slug) => (
                        <option key={slug} value={slug}>
                          {options.data!.categories.find((c) => c.slug === slug)?.name ?? slug}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <MultiCombobox
                  id="tags-input"
                  label="תגיות"
                  tone="gray"
                  value={form.tags}
                  onChange={(v) => set('tags', v)}
                  source={tagOptions}
                  create={(t) => t.trim().replace(/\s+/g, ' ').slice(0, 60) || null}
                  createLabel="תגית חדשה"
                  hint="תגית שלא קיימת בחנות תיווצר בשליחה"
                  placeholder="חיפוש או תגית חדשה…"
                />
              </>
            )}
          </Section>

          <Section title="משקל ומידות" aside={<span className="ax-hint">ביחידות של החנות</span>}>
            <Field id="dims_weight" label="משקל" error={errors.dims_weight}>
              <input {...fp('dims_weight')} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={form.dims.weight} onChange={(e) => setDim('weight', e.target.value.trim())} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {(
                [
                  ['length', 'אורך'],
                  ['width', 'רוחב'],
                  ['height', 'גובה'],
                ] as const
              ).map(([k, l]) => (
                <Field key={k} id={`dims_${k}`} label={l} error={errors[`dims_${k}`]}>
                  <input {...fp(`dims_${k}`)} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={form.dims[k]} onChange={(e) => setDim(k, e.target.value.trim())} />
                </Field>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {storeError && (
        <div className="ax-alert is-bad" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{storeError}</span>
        </div>
      )}

      <div className="ax-pf-bar" role="region" aria-label="שמירה ושליחה">
        <div className="ax-pf-bar-status">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {inStore ? (
              <>
                בחנות <WooLink id={initial!.wooProductId!} />
              </>
            ) : productId ? (
              'נשמר במערכת · לא בחנות'
            ) : (
              'מוצר חדש · עוד לא נשמר'
            )}
            {dirty && productId && <StatusMark status="dirty" />}
          </span>
          {blockers.length > 0 && <span className="ax-hint">כדי לשלוח לחנות חסר: {blockers.join(', ')}</span>}
        </div>
        <div className="ax-pf-bar-actions">
          <button type="button" className="ax-btn" onClick={() => submit(false)} disabled={!!busy || (!!productId && !dirty)}>
            {busy === 'save' ? <Spin /> : <Save size={18} aria-hidden="true" />}
            שמירה
          </button>
          <button type="button" className="ax-btn is-primary" onClick={() => submit(true)} disabled={!!busy || blockers.length > 0}>
            {busy === 'send' ? <Spin /> : <Store size={18} aria-hidden="true" />}
            {inStore ? (dirty ? 'שמירה ועדכון בחנות' : 'עדכון בחנות') : 'שמירה ושליחה לחנות'}
          </button>
        </div>
      </div>
    </>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ax-card" aria-label={title}>
      <div className="ax-card-head">
        <h2 className="ax-h2">{title}</h2>
        {aside}
      </div>
      <div className="ax-card-pad ax-pf-stack">{children}</div>
    </section>
  )
}

/* ── משלוח ── */

const SHIP_MODES: [ShipMode, string][] = [
  ['flat', 'מחיר קבוע'],
  ['free', 'חינם'],
  ['none', 'לא שולחים'],
]

function ShipFields({ side, label, value, errors, onChange, fp }: { side: 'us' | 'intl'; label: string; value: ShipInput; errors: FieldErrors; onChange: (v: Partial<ShipInput>) => void; fp: (id: string, hint?: boolean) => object }) {
  return (
    <div className="ax-inner ax-pf-stack" style={{ padding: 14, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <Seg label={`משלוח ${label}`} options={SHIP_MODES} value={value.mode} onChange={(mode) => onChange({ mode })} />
      </div>
      {value.mode === 'flat' && (
        <div className="ax-grid-2" style={{ gap: 10 }}>
          <Field id={`ship_${side}_cost`} label="Standard · פריט ראשון" error={errors[`ship_${side}_cost`]}>
            <input {...fp(`ship_${side}_cost`)} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={value.cost} onChange={(e) => onChange({ cost: e.target.value.trim() })} placeholder="0.00" />
          </Field>
          <Field id={`ship_${side}_additional`} label="כל פריט נוסף" error={errors[`ship_${side}_additional`]}>
            <input {...fp(`ship_${side}_additional`)} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={value.additional} onChange={(e) => onChange({ additional: e.target.value.trim() })} placeholder="לא חובה" />
          </Field>
        </div>
      )}
      {value.mode === 'free' && <span className="ax-hint">משלוח Standard חינם</span>}
      {value.mode === 'none' ? (
        <span className="ax-hint">{side === 'us' ? 'המוצר לא יישלח לארה״ב' : 'המוצר יישלח לארה״ב בלבד'}</span>
      ) : (
        <>
          <Switch on={value.express} onChange={(express) => onChange({ express })}>
            גם משלוח אקספרס
          </Switch>
          {value.express && (
            <div className="ax-grid-2" style={{ gap: 10 }}>
              <Field id={`ship_${side}_expressCost`} label="Express · פריט ראשון" error={errors[`ship_${side}_expressCost`]}>
                <input {...fp(`ship_${side}_expressCost`)} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={value.expressCost} onChange={(e) => onChange({ expressCost: e.target.value.trim() })} placeholder="0.00" />
              </Field>
              <Field id={`ship_${side}_expressAdditional`} label="כל פריט נוסף" error={errors[`ship_${side}_expressAdditional`]}>
                <input {...fp(`ship_${side}_expressAdditional`)} className="ax-input ax-num" dir="ltr" inputMode="decimal" value={value.expressAdditional} onChange={(e) => onChange({ expressAdditional: e.target.value.trim() })} placeholder="לא חובה" />
              </Field>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── קטגוריות ── */

function Categories({ all, value, onChange }: { all: Options['categories']; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('')
  const names = new Map(all.map((c) => [c.slug, c.name]))
  const roots = all.filter((c) => !c.parent)
  const kids = (slug: string) => all.filter((c) => c.parent === slug)
  const match = (c: { name: string }) => !q || c.name.toLowerCase().includes(q.toLowerCase())
  const toggle = (slug: string, parent: string | null) => {
    if (value.includes(slug)) onChange(value.filter((s) => s !== slug))
    // ילד שנבחר מכניס גם את האב (כמו בשיוך האוטומטי של מוצרי eBay)
    else onChange(Array.from(new Set([...value, slug, ...(parent ? [parent] : [])])))
  }
  return (
    <div className="ax-pf-stack" style={{ gap: 10 }}>
      <span className="ax-label" id="cats-label">
        קטגוריות
      </span>
      {value.length > 0 && (
        <div className="ax-pf-chips" aria-label="קטגוריות שנבחרו">
          {value.map((s) => (
            <span key={s} className="ax-pill tone-accent">
              {names.get(s) ?? s}
              <button type="button" aria-label={`הסרת ${names.get(s) ?? s}`} onClick={() => onChange(value.filter((x) => x !== s))}>
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input type="search" className="ax-input" aria-label="חיפוש קטגוריה" placeholder="חיפוש קטגוריה" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ax-pf-tree" role="group" aria-labelledby="cats-label">
        {roots.map((r) => {
          const children = kids(r.slug).filter(match)
          if (!match(r) && !children.length) return null
          return (
            <div key={r.slug}>
              <label className="ax-check">
                <input type="checkbox" checked={value.includes(r.slug)} onChange={() => toggle(r.slug, null)} />
                <span style={{ fontWeight: 600 }}>{r.name}</span>
              </label>
              {children.map((c) => (
                <label key={c.slug} className="ax-check is-child">
                  <input type="checkbox" checked={value.includes(c.slug)} onChange={() => toggle(c.slug, r.slug)} />
                  {c.name}
                </label>
              ))}
            </div>
          )
        })}
      </div>
      {!value.length && <span className="ax-hint">בלי קטגוריה — המוצר ייכנס ל-Uncategorized בחנות</span>}
    </div>
  )
}

/* ── שאלות ותשובות ── */

function Faq({ value, errors, onChange }: { value: ManualProductInput['faq']; errors: FieldErrors; onChange: (v: ManualProductInput['faq']) => void }) {
  const update = (i: number, k: 'q' | 'a', v: string) => onChange(value.map((f, j) => (j === i ? { ...f, [k]: v } : f)))
  const move = (i: number, d: number) => {
    const next = [...value]
    const [it] = next.splice(i, 1)
    next.splice(i + d, 0, it)
    onChange(next)
  }
  return (
    <div className="ax-pf-stack" style={{ gap: 12 }}>
      {value.length === 0 && <p className="ax-hint" style={{ margin: 0 }}>בלי שאלות — עמוד המוצר מציג את השאלות הכלליות של האתר. שאלות כאן מחליפות אותן ונכנסות לסכמת FAQPage.</p>}
      <ol className="ax-pf-stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 12 }}>
        {value.map((f, i) => (
          <li key={i} className="ax-inner ax-pf-stack" style={{ padding: 14, gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>שאלה {i + 1}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button type="button" className="ax-btn is-icon is-sm is-ghost" aria-label={`שאלה ${i + 1}: למעלה`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button type="button" className="ax-btn is-icon is-sm is-ghost" aria-label={`שאלה ${i + 1}: למטה`} disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button type="button" className="ax-btn is-icon is-sm is-ghost" aria-label={`הסרת שאלה ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <Field id={`faq_${i}_q`} label="השאלה">
              <input id={`faq_${i}_q`} className="ax-input" dir="ltr" lang="en" value={f.q} onChange={(e) => update(i, 'q', e.target.value)} aria-invalid={errors[`faq_${i}`] ? true : undefined} />
            </Field>
            <Field id={`faq_${i}_a`} label="התשובה" hint="שורה ריקה בין פסקאות" error={errors[`faq_${i}`]}>
              <textarea id={`faq_${i}_a`} className="ax-textarea" dir="ltr" lang="en" rows={3} value={f.a} onChange={(e) => update(i, 'a', e.target.value)} aria-describedby={errors[`faq_${i}`] ? `faq_${i}_a-err` : `faq_${i}_a-hint`} />
            </Field>
          </li>
        ))}
      </ol>
      <button type="button" className="ax-btn is-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, { q: '', a: '' }])} disabled={value.length >= MAX_FAQ}>
        <Plus size={16} aria-hidden="true" />
        הוספת שאלה
      </button>
    </div>
  )
}

/* ── טקסט חלופי לתמונות ── */

function ImageAlts({ images, value, title, onChange }: { images: UploadedImage[]; value: Record<string, string>; title: string; onChange: (v: Record<string, string>) => void }) {
  if (!images.length) return null
  return (
    <details className="ax-inner" style={{ padding: '4px 14px' }}>
      <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
        טקסט חלופי (alt) לתמונות · <span className="ax-num" style={{ marginInline: 4 }}>{images.filter((i) => value[i.id]?.trim()).length}/{images.length}</span>
      </summary>
      <ol className="ax-pf-stack" style={{ listStyle: 'none', margin: '4px 0 14px', padding: 0, gap: 10 }}>
        {images.map((img, i) => (
          <li key={img.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <ZoomThumb images={images.map((x) => x.url)} index={i} title={title || undefined} size={44} thumb={false} alt={`תמונה ${i + 1}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field id={`alt_${img.id}`} label={`תמונה ${i + 1}${i === 0 ? ' (ראשית)' : ''}`}>
                <input id={`alt_${img.id}`} className="ax-input" dir="ltr" lang="en" value={value[img.id] ?? ''} placeholder={`${title || 'Product'} — photo ${i + 1} of ${images.length}`} onChange={(e) => onChange({ ...value, [img.id]: e.target.value })} />
              </Field>
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}
