import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** ראש כרטיס הגדרות: אריח אייקון, כותרת והסבר, תג מצב בצד. */
export function CardHead({ id, icon: Icon, title, text, pill }: { id: string; icon: LucideIcon; title: string; text: string; pill?: ReactNode }) {
  return (
    <div className="ax-card-head" style={{ justifyContent: 'flex-start' }}>
      <span className="ax-tile" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 id={id} className="ax-h2">
          {title}
        </h2>
        <p className="ax-muted" style={{ margin: 0, fontSize: 13 }}>
          {text}
        </p>
      </div>
      {pill}
    </div>
  )
}
