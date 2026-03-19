import { useEffect, useState } from 'react'
import type { Card } from '../../hooks/useDeck'

interface SuggestionCard {
  card_id: string
  name: string
  inclusion: number
  synergy: number
  num_decks: number
  image_uri: string | null
}

interface Category {
  name: string
  cards: SuggestionCard[]
}

interface SuggestionsPanelProps {
  commanderName: string
  deckCardIds: Set<string>
  onAdd: (cardId: string, section: string) => Promise<void>
  onHoverCard: (card: Card | null) => void
  onClose: () => void
}

export function SuggestionsPanel({ commanderName, deckCardIds, onAdd, onHoverCard, onClose }: SuggestionsPanelProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/suggestions/edhrec?commander=${encodeURIComponent(commanderName)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `Failed (${res.status})`)
        }
        return res.json()
      })
      .then((data) => setCategories(data.categories ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [commanderName])

  const handleAdd = async (card: SuggestionCard) => {
    setAdding((prev) => new Set(prev).add(card.card_id))
    try {
      await onAdd(card.card_id, 'Mainboard')
    } finally {
      setAdding((prev) => {
        const next = new Set(prev)
        next.delete(card.card_id)
        return next
      })
    }
  }

  const handleCardHover = (card: SuggestionCard) => {
    if (card.image_uri) {
      onHoverCard({
        id: card.card_id,
        name: card.name,
        image_uris: { small: card.image_uri, normal: card.image_uri, large: card.image_uri, png: card.image_uri },
        scryfall_id: '',
        mana_cost: null,
        cmc: null,
        type_line: null,
        colors: [],
        color_identity: [],
        set_code: null,
        oracle_text: null,
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold">EDHREC Suggestions</h2>
            <p className="text-gray-400 text-sm">{commanderName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <p className="text-gray-400">Loading suggestions...</p>}
          {error && <p className="text-red-400">{error}</p>}
          {!loading && !error && categories.length === 0 && (
            <p className="text-gray-400">No suggestions found for this commander.</p>
          )}

          {categories.map((cat) => (
            <div key={cat.name} className="mb-6">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">{cat.name}</h3>
              <div className="space-y-1">
                {cat.cards.map((card) => {
                  const inDeck = deckCardIds.has(card.card_id)
                  return (
                    <div
                      key={card.card_id}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded hover:bg-gray-700/50 ${inDeck ? 'opacity-50' : ''}`}
                      onMouseEnter={() => handleCardHover(card)}
                      onMouseLeave={() => onHoverCard(null)}
                    >
                      {card.image_uri && (
                        <img src={card.image_uri} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      <span className="flex-1 text-sm">{card.name}</span>
                      <span className="text-xs text-gray-400" title="Inclusion rate">
                        {Math.round(card.inclusion * 100)}%
                      </span>
                      <span className={`text-xs ${card.synergy >= 0 ? 'text-green-400' : 'text-red-400'}`} title="Synergy">
                        {card.synergy >= 0 ? '+' : ''}{Math.round(card.synergy * 100)}%
                      </span>
                      {!inDeck && (
                        <button
                          onClick={() => handleAdd(card)}
                          disabled={adding.has(card.card_id)}
                          className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs font-medium"
                        >
                          +
                        </button>
                      )}
                      {inDeck && (
                        <span className="text-xs text-gray-500">In deck</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
