import { useRef, useState, useEffect, useCallback } from 'react'
import { COLUMN_WIDTH, COLUMN_GAP } from '../lib/cards'

/**
 * Measures a container element and returns how many card columns fit.
 * Updates on window resize via ResizeObserver.
 */
export function useMaxColumns() {
  const ref = useRef<HTMLDivElement>(null)
  const [maxColumns, setMaxColumns] = useState(Infinity)

  const measure = useCallback(() => {
    if (!ref.current) return
    const width = ref.current.clientWidth
    // First column needs COLUMN_WIDTH, each additional needs COLUMN_GAP + COLUMN_WIDTH
    const cols = Math.max(1, Math.floor((width + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)))
    setMaxColumns(cols)
  }, [])

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(ref.current)
    measure()
    return () => observer.disconnect()
  }, [measure])

  return { ref, maxColumns }
}
