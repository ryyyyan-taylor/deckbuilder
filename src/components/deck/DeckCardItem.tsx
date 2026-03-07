import { useState, useEffect, useRef } from 'react'
import type { DeckCard, Card } from '../../hooks/useDeck'

interface DeckCardItemProps {
  deckCard: DeckCard
  onQuantityChange?: (deckCardId: string, quantity: number) => void
  onRemove?: (deckCardId: string) => void
  onHoverCard?: (card: Card | null) => void
  sections?: string[]
  onSendToSection?: (deckCardId: string, targetSection: string) => void
  onActiveChange?: (active: boolean) => void
  readOnly?: boolean
}

export function DeckCardItem({ deckCard, onQuantityChange, onRemove, onHoverCard, sections, onSendToSection, onActiveChange, readOnly }: DeckCardItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const otherSections = (sections ?? []).filter((s) => s !== deckCard.section)

  const isActive = expanded || !!contextMenu

  // Notify parent when active state changes
  useEffect(() => {
    onActiveChange?.(isActive)
  }, [isActive])

  // Close expanded/context menu on click outside or Escape
  useEffect(() => {
    if (!isActive) return

    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setExpanded(false)
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
        setContextMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isActive])

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
    e.preventDefault()
    if (otherSections.length === 0) return
    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) {
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  const imageUrl = deckCard.card?.image_uris?.normal

  return (
    <div
      ref={cardRef}
      style={{
        zIndex: expanded || contextMenu ? 50 : undefined,
        position: 'relative' as const,
      }}
      className={`relative w-[200px] shrink-0 ${readOnly ? '' : 'cursor-pointer'}`}
      onClick={readOnly ? undefined : () => { setExpanded((prev) => !prev); setContextMenu(null) }}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => onHoverCard?.(deckCard.card ?? null)}
      onMouseLeave={() => onHoverCard?.(null)}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={deckCard.card?.name ?? 'Card'}
          className="w-full rounded-lg"
          draggable={false}
        />
      ) : (
        <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-400 p-2 text-center">
          {deckCard.card?.name ?? 'Unknown card'}
        </div>
      )}

      {/* Quantity badge */}
      {deckCard.quantity > 1 && (
        <span className="absolute top-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
          {deckCard.quantity}x
        </span>
      )}

      {/* Expanded overlay with controls */}
      {expanded && !readOnly && (
        <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuantityChange?.(deckCard.id, deckCard.quantity - 1)
            }}
            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-bold"
          >
            −
          </button>
          <span className="text-white font-mono text-sm w-6 text-center">
            {deckCard.quantity}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuantityChange?.(deckCard.id, deckCard.quantity + 1)
            }}
            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-bold"
          >
            +
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove?.(deckCard.id)
            }}
            className="w-7 h-7 bg-red-700 hover:bg-red-600 rounded text-white text-sm font-bold ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && !readOnly && otherSections.length > 0 && (
        <div
          ref={menuRef}
          className="absolute bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y, zIndex: 100 }}
          onClick={(e) => e.stopPropagation()}
        >
          {otherSections.map((s) => (
            <button
              key={s}
              onClick={(e) => {
                e.stopPropagation()
                onSendToSection?.(deckCard.id, s)
                setContextMenu(null)
                setExpanded(false)
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Send to {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
