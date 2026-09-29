'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { api } from './api'
import type { WooStatus } from './types'

// כתובת החנות נטענת פעם אחת לכל המסך (לא לכל שורה)
let basePromise: Promise<string | null> | null = null
function loadBase() {
  basePromise ??= api.get<WooStatus>('/api/sync/woo/status').then(
    (s) => s.baseUrl,
    () => ((basePromise = null), null),
  )
  return basePromise
}

/** מזהה המוצר בחנות כקישור לעריכה ב-WooCommerce (לשונית חדשה). בלי כתובת חנות — רק המספר. */
export function WooLink({ id }: { id: number }) {
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void loadBase().then((b) => alive && setBase(b))
    return () => {
      alive = false
    }
  }, [])
  if (!base) return <span className="ax-num ax-ltr">#{id}</span>
  return (
    <a
      href={`${base}/wp-admin/post.php?post=${id}&action=edit`}
      target="_blank"
      rel="noopener noreferrer"
      className="ax-num ax-ltr"
      onClick={(e) => e.stopPropagation()}
      aria-label={`פתיחת מוצר ${id} בחנות בלשונית חדשה`}
    >
      #{id} <ExternalLink size={14} aria-hidden="true" style={{ verticalAlign: -2 }} />
    </a>
  )
}
