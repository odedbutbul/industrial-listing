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
      if (error) {
        toast.error(`שגיאה בהעלאת ${file.name}`)
        continue
      }

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
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-orange-500 bg-orange-500/10' : 'border-white/20 hover:border-orange-500/50'
        }`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
        {uploading ? (
          <p className="text-orange-400">מעלה תמונות...</p>
        ) : (
          <>
            <p className="text-white/60">גרור תמונות לכאן או לחץ לבחירה</p>
            <p className="text-white/40 text-sm mt-1">מקסימום 20 תמונות, 10MB כל אחת</p>
          </>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((url, i) => (
            <div key={url} className="relative group aspect-square">
              {i === 0 && (
                <span className="absolute top-1 right-1 z-10 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">
                  ראשית
                </span>
              )}
              <img src={url} alt={`תמונה ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg text-white text-xl"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
