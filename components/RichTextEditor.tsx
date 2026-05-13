'use client'

import dynamic from 'next/dynamic'
import 'react-quill/dist/quill.snow.css'
import './quill-overrides.css'

const ReactQuill = dynamic(() => import('react-quill'), {
  ssr: false,
  loading: () => (
    <div className="h-40 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse border border-gray-200 dark:border-white/10" />
  ),
})

const MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
}

const FORMATS = ['header', 'bold', 'italic', 'underline', 'list', 'bullet']

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'פירוט טכני, מצב, הערות, מה כלול במכירה...',
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder}
      />
    </div>
  )
}
