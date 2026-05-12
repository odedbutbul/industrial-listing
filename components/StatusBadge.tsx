'use client'

type EbayStatus = 'pending' | 'published' | 'failed' | 'sold'
type FacebookStatus = 'pending' | 'published' | 'copied'
type GeneralStatus = 'active' | 'sold' | 'archived'

const ebay: Record<EbayStatus, { label: string; cls: string }> = {
  pending:   { label: '⏳ ממתין',  cls: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50' },
  published: { label: '✅ פורסם',  cls: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400' },
  failed:    { label: '❌ נכשל',   cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
  sold:      { label: '🏷️ נמכר',  cls: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400' },
}

const facebook: Record<FacebookStatus, { label: string; cls: string }> = {
  pending:   { label: '⏳ ממתין',   cls: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/50' },
  published: { label: '✅ פורסם',   cls: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400' },
  copied:    { label: '📋 הועתק',   cls: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400' },
}

const general: Record<GeneralStatus, { label: string; cls: string }> = {
  active:   { label: '🟢 פעיל',   cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  sold:     { label: '🏷️ נמכר',  cls: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400' },
  archived: { label: '📦 ארכיון', cls: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/40' },
}

const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap'

export function EbayBadge({ status }: { status: EbayStatus }) {
  const { label, cls } = ebay[status]
  return <span className={`${base} ${cls}`}>{label}</span>
}

export function FacebookBadge({ status }: { status: FacebookStatus }) {
  const { label, cls } = facebook[status]
  return <span className={`${base} ${cls}`}>{label}</span>
}

export function GeneralBadge({ status }: { status: GeneralStatus }) {
  const { label, cls } = general[status]
  return <span className={`${base} ${cls}`}>{label}</span>
}
