import type { Card } from '../../hooks/useDeck'
import type { Game } from '../../lib/games'
import { ASPECT_COLORS, type SwuAspect } from '../../lib/swu'

interface Props {
  card: Card | null
  game: Game
}

export default function CardPreviewPanel({ card, game }: Props) {
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

      {game === 'swu' ? (
        <SwuCardInfo card={card} />
      ) : (
        <MtgCardInfo card={card} />
      )}
    </div>
  )
}

function MtgCardInfo({ card }: { card: Card }) {
  return (
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
  )
}

function SwuCardInfo({ card }: { card: Card }) {
  const hasStats = card.power != null || card.hp != null

  return (
    <div className="mt-3 space-y-2">
      {/* Name + cost */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm leading-tight">{card.name}</p>
        {card.cost != null && (
          <span className="shrink-0 text-xs font-bold bg-gray-700 border border-gray-600 px-1.5 py-0.5 rounded text-gray-200">
            {card.cost}
          </span>
        )}
      </div>

      {/* Type line */}
      {card.type_line && (
        <p className="text-gray-500 text-xs">{card.type_line}</p>
      )}

      {/* Aspects */}
      {card.aspects && card.aspects.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {card.aspects.map((aspect) => (
            <span key={aspect} className="flex items-center gap-1 text-xs text-gray-300">
              <span
                className="w-2.5 h-2.5 rounded-full border border-gray-500 shrink-0"
                style={{ backgroundColor: ASPECT_COLORS[aspect as SwuAspect] ?? '#6b7280' }}
              />
              {aspect}
            </span>
          ))}
        </div>
      )}

      {/* Power / HP */}
      {hasStats && (
        <div className="flex gap-4 text-xs">
          {card.power != null && (
            <span className="flex items-center gap-1 text-gray-300">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-gray-400" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1.5a.5.5 0 0 1 .447.276l1.5 3 .052.111 3.25.473a.5.5 0 0 1 .277.853l-2.352 2.293.555 3.236a.5.5 0 0 1-.726.527L8 10.567l-2.903 1.527a.5.5 0 0 1-.726-.527l.555-3.236L2.474 6.213a.5.5 0 0 1 .277-.853l3.25-.473.052-.111 1.5-3A.5.5 0 0 1 8 1.5z"/>
              </svg>
              <span className="font-semibold">{card.power}</span>
              <span className="text-gray-600">ATK</span>
            </span>
          )}
          {card.hp != null && (
            <span className="flex items-center gap-1 text-gray-300">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-red-400" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/>
              </svg>
              <span className="font-semibold">{card.hp}</span>
              <span className="text-gray-600">HP</span>
            </span>
          )}
        </div>
      )}

      {/* Arena */}
      {card.arena && (
        <p className="text-gray-500 text-xs">{card.arena} Arena</p>
      )}

      {/* Set */}
      {card.set_code && (
        <p className="text-gray-600 text-xs uppercase">{card.set_code}</p>
      )}
    </div>
  )
}
