'use client'

import { useRef, useState } from 'react'

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if ((ch === ',' || ch === '\t') && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0])
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line)
    if (vals.every(v => !v.trim())) return null
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? '').trim() })
    return row
  }).filter(Boolean) as Record<string, string>[]
}

function col(row: Record<string, string>, ...keys: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const k of Object.keys(row)) {
    if (keys.some(key => norm(k) === norm(key))) return row[k]
  }
  return ''
}

interface ImportProduct {
  ebay_item_number: string
  title: string
  sku: string
  price: number | undefined
  quantity: number | undefined
  ebay_category: string
  condition: string
  manufacturer: string
  model: string
}

function rowToProduct(row: Record<string, string>): ImportProduct | null {
  const itemNumber = col(row, 'Item number', 'ItemNumber')
  const title = col(row, 'Title')
  if (!itemNumber && !title) return null

  const priceStr = col(row, 'Start price', 'StartPrice', 'Price', 'Current price')
  const qtyStr   = col(row, 'Quantity available', 'Available quantity', 'Quantity', 'qty')
  const category = col(row, 'Category name', 'CategoryName')
  const condition = col(row, 'Condition')
  const sku       = col(row, 'Custom label (SKU)', 'Custom label', 'SKU', 'sku')

  const words = title.trim().split(/\s+/)
  const manufacturer = words[0] || 'Unknown'
  const model = words.slice(1, 3).join(' ') || title.slice(0, 30)

  return {
    ebay_item_number: itemNumber,
    title,
    sku,
    price: priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) || undefined : undefined,
    quantity: qtyStr ? parseInt(qtyStr) || 1 : 1,
    ebay_category: category,
    condition: condition || 'Used',
    manufacturer,
    model,
  }
}

interface Props {
  onClose: () => void
  onDone: () => void
}

export default function CsvImportModal({ onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportProduct[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; updated: number; errors: number } | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      const products = rows.map(rowToProduct).filter(Boolean) as ImportProduct[]
      setPreview(products)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: preview }),
      })
      setResult(await res.json())
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-white/10 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">ייבא מוצרים מ-CSV</h2>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 dark:text-white/40 text-lg">
            ✕
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-500/10">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{result.imported}</p>
                <p className="text-xs text-green-700/60 dark:text-green-400/70 mt-1">נוספו</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10">
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{result.updated}</p>
                <p className="text-xs text-blue-700/60 dark:text-blue-400/70 mt-1">עודכנו</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-red-50 dark:bg-red-500/10">
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{result.errors}</p>
                <p className="text-xs text-red-700/60 dark:text-red-400/70 mt-1">שגיאות</p>
              </div>
            </div>
            <button onClick={() => { onDone(); onClose() }} className="btn-primary w-full py-2.5">
              סגור ורענן
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-gray-500 dark:text-white/50 mb-3">
                העלה קובץ CSV מדוח eBay Active Listings.<br />
                עמודות מוכרות: <span className="font-mono text-xs">Item number, Title, Custom label, Start price, Quantity available, Category name, Condition</span>
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl p-8 text-center hover:border-orange-400 dark:hover:border-orange-500/50 transition-colors">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-sm font-medium text-gray-600 dark:text-white/60">לחץ לבחירת קובץ CSV</p>
                <p className="text-xs text-gray-400 dark:text-white/30 mt-1">.csv / .txt / .tsv</p>
              </button>
            </div>

            {preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-white/70">
                    נמצאו <span className="text-orange-500 font-bold">{preview.length}</span> מוצרים
                  </p>
                  <button
                    onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:text-white/30 dark:hover:text-white/50">
                    נקה
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-50 dark:divide-white/[0.04]">
                  {preview.slice(0, 30).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                      <span className="text-xs text-gray-400 dark:text-white/30 w-20 shrink-0 font-mono truncate">
                        {p.ebay_item_number || '—'}
                      </span>
                      <span className="text-xs text-gray-700 dark:text-white/70 flex-1 truncate">{p.title}</span>
                      <span className="text-xs text-gray-400 dark:text-white/40 shrink-0">
                        {p.price != null ? `$${p.price}` : '—'}
                      </span>
                    </div>
                  ))}
                  {preview.length > 30 && (
                    <div className="px-3 py-2 text-xs text-center text-gray-400 dark:text-white/30">
                      ועוד {preview.length - 30} מוצרים...
                    </div>
                  )}
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || preview.length === 0}
                  className="btn-primary w-full py-2.5 disabled:opacity-50">
                  {importing ? 'מייבא...' : `ייבא ${preview.length} מוצרים`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
