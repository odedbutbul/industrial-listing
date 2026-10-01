'use client'

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  CodeXml,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

/**
 * עורך תיאור המוצר (WYSIWYG). התוכן באנגלית — העורך עצמו LTR, הכלים בעברית.
 * מפיק HTML נקי: כותרות H2–H4, הדגשות, רשימות, ציטוט, יישור, קישורים, טבלאות (מפרט טכני), קו מפריד.
 * מצב "קוד HTML" לעריכה ישירה.
 */
export function RichTextEditor({ id, value, onChange, label, placeholder, describedBy }: { id: string; value: string; onChange: (html: string) => void; label: string; placeholder?: string; describedBy?: string }) {
  const [source, setSource] = useState<string | null>(null)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    editorProps: {
      attributes: { id, class: 'ax-rte-doc', dir: 'ltr', lang: 'en', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, ...(describedBy ? { 'aria-describedby': describedBy } : {}) },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  })

  const toggleSource = () => {
    if (!editor) return
    if (source === null) setSource(editor.isEmpty ? '' : editor.getHTML())
    else {
      editor.commands.setContent(source, { emitUpdate: true })
      setSource(null)
    }
  }

  return (
    <div className="ax-rte">
      {editor && <Toolbar editor={editor} sourceMode={source !== null} onToggleSource={toggleSource} />}
      {source !== null ? (
        <textarea
          className="ax-rte-source"
          dir="ltr"
          aria-label={`${label} — קוד HTML`}
          value={source}
          onChange={(e) => {
            setSource(e.target.value)
            onChange(e.target.value)
          }}
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  )
}

function Toolbar({ editor, sourceMode, onToggleSource }: { editor: Editor; sourceMode: boolean; onToggleSource: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : e.isActive('heading', { level: 4 }) ? 'h4' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      link: e.isActive('link'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const [linkOpen, setLinkOpen] = useState(false)
  const [href, setHref] = useState('')
  const c = () => editor.chain().focus()

  const openLink = () => {
    setHref(s.href || 'https://')
    setLinkOpen(true)
  }
  const applyLink = () => {
    const url = href.trim()
    if (!url || url === 'https://') c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url }).run()
    setLinkOpen(false)
  }

  const off = sourceMode
  return (
    <>
      <div className="ax-rte-bar" role="toolbar" aria-label="עיצוב טקסט">
        <Tool icon={Undo2} label="ביטול" onClick={() => c().undo().run()} disabled={off || !s.canUndo} />
        <Tool icon={Redo2} label="חזרה" onClick={() => c().redo().run()} disabled={off || !s.canRedo} />
        <span className="ax-rte-sep" aria-hidden="true" />
        <select
          className="ax-select"
          aria-label="סוג פסקה"
          value={s.block}
          disabled={off}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'p') c().setParagraph().run()
            else c().setHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 }).run()
          }}
        >
          <option value="p">טקסט רגיל</option>
          <option value="h2">כותרת 2</option>
          <option value="h3">כותרת 3</option>
          <option value="h4">כותרת 4</option>
        </select>
        <span className="ax-rte-sep" aria-hidden="true" />
        <Tool icon={Bold} label="מודגש" on={s.bold} onClick={() => c().toggleBold().run()} disabled={off} />
        <Tool icon={Italic} label="נטוי" on={s.italic} onClick={() => c().toggleItalic().run()} disabled={off} />
        <Tool icon={Underline} label="קו תחתון" on={s.underline} onClick={() => c().toggleUnderline().run()} disabled={off} />
        <Tool icon={Strikethrough} label="קו חוצה" on={s.strike} onClick={() => c().toggleStrike().run()} disabled={off} />
        <span className="ax-rte-sep" aria-hidden="true" />
        <Tool icon={List} label="רשימת תבליטים" on={s.bullet} onClick={() => c().toggleBulletList().run()} disabled={off} />
        <Tool icon={ListOrdered} label="רשימה ממוספרת" on={s.ordered} onClick={() => c().toggleOrderedList().run()} disabled={off} />
        <Tool icon={Quote} label="ציטוט" on={s.quote} onClick={() => c().toggleBlockquote().run()} disabled={off} />
        <span className="ax-rte-sep" aria-hidden="true" />
        <Tool icon={AlignLeft} label="יישור לשמאל" on={s.left} onClick={() => c().setTextAlign('left').run()} disabled={off} />
        <Tool icon={AlignCenter} label="מרכוז" on={s.center} onClick={() => c().setTextAlign('center').run()} disabled={off} />
        <Tool icon={AlignRight} label="יישור לימין" on={s.right} onClick={() => c().setTextAlign('right').run()} disabled={off} />
        <span className="ax-rte-sep" aria-hidden="true" />
        <Tool icon={Link2} label="קישור" on={s.link || linkOpen} onClick={openLink} disabled={off} />
        {s.link && <Tool icon={Unlink} label="הסרת קישור" onClick={() => c().extendMarkRange('link').unsetLink().run()} disabled={off} />}
        <Tool icon={Table} label="הוספת טבלה" on={s.table} onClick={() => c().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()} disabled={off || s.table} />
        {s.table && (
          <>
            <Tool icon={BetweenHorizontalEnd} label="הוספת שורה" onClick={() => c().addRowAfter().run()} disabled={off} />
            <Tool icon={BetweenVerticalEnd} label="הוספת עמודה" onClick={() => c().addColumnAfter().run()} disabled={off} />
            <button type="button" className="ax-btn is-sm is-ghost" onClick={() => c().deleteRow().run()} disabled={off}>
              מחיקת שורה
            </button>
            <button type="button" className="ax-btn is-sm is-ghost" onClick={() => c().deleteColumn().run()} disabled={off}>
              מחיקת עמודה
            </button>
            <Tool icon={Trash2} label="מחיקת הטבלה" onClick={() => c().deleteTable().run()} disabled={off} />
          </>
        )}
        <Tool icon={Minus} label="קו מפריד" onClick={() => c().setHorizontalRule().run()} disabled={off} />
        <Tool icon={RemoveFormatting} label="ניקוי עיצוב" onClick={() => c().unsetAllMarks().clearNodes().run()} disabled={off} />
        <span className="ax-rte-sep" aria-hidden="true" />
        <Tool icon={CodeXml} label={sourceMode ? 'חזרה לעורך' : 'קוד HTML'} on={sourceMode} onClick={onToggleSource} />
      </div>
      {linkOpen && !off && (
        <div className="ax-rte-link">
          <input
            className="ax-input ax-ltr"
            dir="ltr"
            type="url"
            aria-label="כתובת הקישור"
            value={href}
            autoFocus
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setLinkOpen(false)
              }
            }}
          />
          <button type="button" className="ax-btn is-sm is-primary" onClick={applyLink}>
            החלה
          </button>
          <button type="button" className="ax-btn is-sm is-ghost" onClick={() => setLinkOpen(false)}>
            ביטול
          </button>
        </div>
      )}
    </>
  )
}

function Tool({ icon: Icon, label, onClick, on, disabled }: { icon: LucideIcon; label: string; onClick: () => void; on?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="ax-btn is-icon is-sm is-ghost" aria-label={label} title={label} aria-pressed={on === undefined ? undefined : on} onClick={onClick} disabled={disabled}>
      <Icon size={17} aria-hidden="true" />
    </button>
  )
}
