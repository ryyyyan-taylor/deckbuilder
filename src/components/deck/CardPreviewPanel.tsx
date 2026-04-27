import { useState, useEffect } from 'react'
import type { Card } from '../../hooks/useDeck'
import type { Game } from '../../lib/games'

/** Returns the back-face image URL for DFCs (MTG) or Leaders (SWU), null if single-faced */
function backFaceUrl(card: Card, game: Game): string | null {
  if (game === 'swu') {
    return card.image_uris?.back ?? null
  }
  // MTG: Scryfall CDN serves back faces at the /back/ path using the card's scryfall_id
  const isDfc = card.name?.includes(' // ') || card.type_line?.includes(' // ')
  if (!isDfc) return null
  const id = card.scryfall_id
  return `https://cards.scryfall.io/normal/back/${id[0]}/${id[1]}/${id}.jpg`
}

interface Props {
  card: Card | null
  game: Game
}

export default function CardPreviewPanel({ card, game }: Props) {
  const [flipped, setFlipped] = useState(false)

  // Reset flip state whenever the hovered card changes
  useEffect(() => { setFlipped(false) }, [card?.id])

  const backUrl = card ? backFaceUrl(card, game) : null
  const imageUrl = flipped && backUrl ? backUrl : card?.image_uris?.normal

  if (!card) {
    return (
      <div className="w-full aspect-[2.5/3.5] bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-600 p-4 text-center">
        Hover over a card to preview
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={card.name}
            className="w-full rounded-lg shadow-xl"
          />
        ) : (
          <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-400 p-4 text-center">
            No image available
          </div>
        )}
        {backUrl && (
          <button
            onClick={() => setFlipped(f => !f)}
            title={flipped ? 'Show front face' : 'Show back face'}
            className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white shadow transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="font-semibold text-sm">{card.name}</p>
        {card.mana_cost && (
          <p className="text-gray-400 text-sm">{card.mana_cost}</p>
        )}
        {card.type_line && (
          <p className="text-gray-500 text-xs">{card.type_line}</p>
        )}
        {card.oracle_text && (
          <p className="text-gray-400 text-xs mt-2 whitespace-pre-line leading-relaxed">{card.oracle_text}</p>
        )}
        {card.set_code && (
          <p className="text-gray-600 text-xs uppercase mt-2">{card.set_code}</p>
        )}
      </div>
    </div>
  )
}
