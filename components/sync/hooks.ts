'use client'

import { useEffect } from 'react'
import { DATA_CHANGED } from './api'

/** טוען מחדש כשפעולה במסך אחר שינתה נתונים (למשל ייבוא מה-header). */
export function useDataChanged(reload: () => unknown): void {
  useEffect(() => {
    const on = () => void reload()
    window.addEventListener(DATA_CHANGED, on)
    return () => window.removeEventListener(DATA_CHANGED, on)
  }, [reload])
}
