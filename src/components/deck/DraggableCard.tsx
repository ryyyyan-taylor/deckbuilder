import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { DeckCard, Card } from '../../hooks/useDeck'

interface DraggableCardProps {
  deckCard: DeckCard
  onQuantityChange: (deckCardId: string, quantity: number) => void
  onRemove: (deckCardId: string) => void
  onHoverCard?: (card: Card | null) => void
}

export function DraggableCard({ deckCard, onQuantityChange, onRemove, onHoverCard }: DraggableCardProps) {
  const [hovered, setHovered] = useState(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deckCard.id,
    data: { deckCard },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  const imageUrl = deckCard.card?.image_uris?.normal

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative w-[150px] shrink-0 cursor-grab active:cursor-grabbing touch-none"
      onMouseEnter={() => { setHovered(true); onHoverCard?.(deckCard.card ?? null) }}
      onMouseLeave={() => { setHovered(false); onHoverCard?.(null) }}
      {...listeners}
      {...attributes}
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

      {/* Hover overlay with controls */}
      {hovered && !isDragging && (
        <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onQuantityChange(deckCard.id, deckCard.quantity - 1)
            }}
            onPointerDown={(e) => e.stopPropagation()}
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
              onQuantityChange(deckCard.id, deckCard.quantity + 1)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-bold"
          >
            +
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(deckCard.id)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-7 h-7 bg-red-700 hover:bg-red-600 rounded text-white text-sm font-bold ml-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
