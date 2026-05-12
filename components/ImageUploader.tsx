'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Props {
  productId: string
  images: string[]
  onChange: (images: string[]) => void
}

export default function ImageUploader({ productId, images, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function uploadFiles(files: FileList) {
    if (images.length + files.length > 20) {
      toast.error('מקסימום 20 תמונות')
      return
    }
    setUploading(true)
    const newUrls: string[] = []

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} גדול מ-10MB`)
        continue
      }
      const ext = file.name.split('.').pop()
      const path = `products/${productId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('product-images').upload(path, file)
      if (error) { toast.error(`שגיאה בהעלאת ${file.name}`); continue }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      newUrls.push(data.publicUrl)
    }

    onChange([...images, ...newUrls])
    setUploading(false)
    if (newUrls.length > 0) toast.success(`${newUrls.length} תמונות הועלו`)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
  }

  async function removeImage(url: string) {
    const path = url.split('/product-images/')[1]
    if (path) await supabase.storage.from('product-images').remove([path])
    onChange(images.filter((img) => img !== url))
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
          ${dragging
            ? 'border-orange-500 bg-orange-500/5 scale-[1.01]'
            : 'border-gray-200 dark:border-white/15 hover:border-orange-400 dark:hover:border-orange-500/50 hover:bg-orange-500/[0.02]'
          }`}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
        <div className="flex flex-col items-center gap-2">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
            ${dragging ? 'bg-orange-500/20' : 'bg-gray-100 dark:bg-white/5'}`}>
            {uploading ? (
              <svg className="w-6 h-6 text-orange-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                className={`w-6 h-6 ${dragging ? 'text-orange-500' : 'text-gray-400 dark:text-white/30'}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            )}
          </div>
          <div>
            <p className={`text-sm font-medium ${dragging ? 'text-orange-500' : 'text-gray-600 dark:text-white/60'}`}>
              {uploading ? 'מעלה תמונות...' : 'גרור תמונות לכאן או לחץ לבחירה'}
            </p>
            <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">עד 20 תמונות • מקסימום 10MB כל אחת</p>
          </div>
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {images.map((url, i) => (
            <div key={url} className="relative group aspect-square">
              {i === 0 && (
                <span className="absolute top-1.5 right-1.5 z-10 bg-orange-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-lg shadow">
                  ראשית
                </span>
              )}
              <img src={url} alt="" className="w-full h-full object-cover rounded-xl" />
              <button type="button" onClick={() => removeImage(url)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100
                           transition-opacity flex items-center justify-center rounded-xl">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
