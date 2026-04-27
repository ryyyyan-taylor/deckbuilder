import type { Card } from '../../hooks/useDeck'
import type { Game } from '../../lib/games'

interface Props {
  card: Card | null
  game: Game
}

export default function CardPreviewPanel({ card }: Props) {
  if (!card) {
    return (
      <div className="w-full aspect-[2.5/3.5] bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-600 p-4 text-center">
        Hover over a card to preview
      </div>
    )
  }

  return (
    <div>
      {card.image_uris?.normal ? (
        <img
          src={card.image_uris.normal}
          alt={card.name}
          className="w-full rounded-lg shadow-xl"
        />
      ) : (
        <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-400 p-4 text-center">
          No image available
        </div>
      )}
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
