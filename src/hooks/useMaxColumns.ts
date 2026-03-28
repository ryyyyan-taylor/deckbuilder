import { useState, useEffect, useCallback } from 'react'
import { COLUMN_WIDTH, COLUMN_GAP } from '../lib/cards'

/**
 * Measures a container element and returns how many card columns fit.
 * Uses a callback ref so the observer is set up when the element actually
 * mounts (not just on component mount, which may precede the element).
 * Updates on resize via ResizeObserver.
 */
export function useMaxColumns() {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [maxColumns, setMaxColumns] = useState(Infinity)

  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element) return
    const measure = () => {
      const width = element.clientWidth
      const cols = Math.max(1, Math.floor((width + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)))
      setMaxColumns(cols)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [element])

  return { ref, maxColumns }
}
