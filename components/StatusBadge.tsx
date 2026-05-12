'use client'

type EbayStatus = 'pending' | 'published' | 'failed' | 'sold'
type FacebookStatus = 'pending' | 'published' | 'copied'
type GeneralStatus = 'active' | 'sold' | 'archived'

const ebayLabels: Record<EbayStatus, string> = {
  pending: '⏳ ממתין',
  published: '✅ פורסם',
  failed: '❌ נכשל',
  sold: '🏷️ נמכר',
}

const facebookLabels: Record<FacebookStatus, string> = {
  pending: '⏳ ממתין',
  published: '✅ פורסם',
  copied: '📋 הועתק',
}

const generalLabels: Record<GeneralStatus, string> = {
  active: '🟢 פעיל',
  sold: '🏷️ נמכר',
  archived: '📦 ארכיון',
}

const ebayColors: Record<EbayStatus, string> = {
  pending: 'bg-gray-700 text-gray-300',
  published: 'bg-green-800 text-green-200',
  failed: 'bg-red-800 text-red-200',
  sold: 'bg-purple-800 text-purple-200',
}

const facebookColors: Record<FacebookStatus, string> = {
  pending: 'bg-gray-700 text-gray-300',
  published: 'bg-green-800 text-green-200',
  copied: 'bg-blue-800 text-blue-200',
}

const generalColors: Record<GeneralStatus, string> = {
  active: 'bg-green-900 text-green-300',
  sold: 'bg-purple-900 text-purple-300',
  archived: 'bg-gray-800 text-gray-400',
}

export function EbayBadge({ status }: { status: EbayStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ebayColors[status]}`}>
      {ebayLabels[status]}
    </span>
  )
}

export function FacebookBadge({ status }: { status: FacebookStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${facebookColors[status]}`}>
      {facebookLabels[status]}
    </span>
  )
}

export function GeneralBadge({ status }: { status: GeneralStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${generalColors[status]}`}>
      {generalLabels[status]}
    </span>
  )
}
