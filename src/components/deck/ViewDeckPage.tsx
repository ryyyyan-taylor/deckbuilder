import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDeck } from '../../hooks/useDeck'
import type { Deck, DeckCard, Card } from '../../hooks/useDeck'
import { DeckSection } from './DeckSection'
import type { SortBy } from './DeckSection'
import { useAuth } from '../../hooks/useAuth'

export function ViewDeckPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { fetchDeck, fetchDeckCards, loading } = useDeck()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    fetchDeck(id).then((d) => {
      if (!d) {
        setNotFound(true)
        return
      }
      if (!d.is_public && d.user_id !== user?.id) {
        setNotFound(true)
        return
      }
      setDeck(d)
    })
    fetchDeckCards(id).then(setDeckCards)
  }, [id])

  if (loading && !deck) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (notFound || (!deck && !loading)) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Deck not found or is private.</p>
          <Link to="/decks" className="text-blue-400 hover:underline text-sm">
            Go to my decks
          </Link>
        </div>
      </div>
    )
  }

  const sections = deck!.sections ?? ['Mainboard']
  const cardsBySection = sections.reduce<Record<string, DeckCard[]>>((acc, s) => {
    acc[s] = deckCards.filter((dc) => dc.section === s)
    return acc
  }, {})
  const totalCards = deckCards.reduce((sum, dc) => sum + dc.quantity, 0)
  const isOwner = user?.id === deck!.user_id

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/decks" className="text-gray-400 hover:text-gray-300 text-sm">
              &larr; Back to decks
            </Link>
            <h1 className="text-2xl font-bold mt-1">{deck!.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {deck!.format && (
                <span className="bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-300">
                  {deck!.format}
                </span>
              )}
              <span className="text-gray-500 text-sm">{totalCards} cards</span>
            </div>
            {deck!.description && (
              <p className="text-gray-400 text-sm mt-2">{deck!.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded text-sm">
              <button
                onClick={() => setSortBy('name')}
                className={`px-3 py-1.5 rounded-l ${sortBy === 'name' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
              >
                Name
              </button>
              <button
                onClick={() => setSortBy('cmc')}
                className={`px-3 py-1.5 rounded-r ${sortBy === 'cmc' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
              >
                Mana Value
              </button>
            </div>
            {isOwner && (
              <Link
                to={`/decks/${deck!.id}/edit`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium text-sm"
              >
                Edit Deck
              </Link>
            )}
          </div>
        </div>

        {/* Two-column layout: sections + preview */}
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="space-y-4">
              {sections.map((s) => (
                <DeckSection
                  key={s}
                  section={s}
                  cards={cardsBySection[s]}
                  onHoverCard={setPreviewCard}
                  sortBy={sortBy}
                  readOnly
                />
              ))}
            </div>
          </div>

          {/* Sticky preview panel */}
          <div className="w-[300px] shrink-0 hidden lg:block">
            <div className="sticky top-8">
              {previewCard ? (
                <div>
                  {previewCard.image_uris?.normal ? (
                    <img
                      src={previewCard.image_uris.normal}
                      alt={previewCard.name}
                      className="w-full rounded-lg shadow-xl"
                    />
                  ) : (
                    <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-400 p-4 text-center">
                      No image available
                    </div>
                  )}
                  <div className="mt-3 space-y-1">
                    <p className="font-semibold text-sm">{previewCard.name}</p>
                    {previewCard.mana_cost && (
                      <p className="text-gray-400 text-sm">{previewCard.mana_cost}</p>
                    )}
                    {previewCard.type_line && (
                      <p className="text-gray-500 text-xs">{previewCard.type_line}</p>
                    )}
                    {previewCard.oracle_text && (
                      <p className="text-gray-400 text-xs mt-2 whitespace-pre-line leading-relaxed">{previewCard.oracle_text}</p>
                    )}
                    {previewCard.set_code && (
                      <p className="text-gray-600 text-xs uppercase mt-2">{previewCard.set_code}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full aspect-[2.5/3.5] bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-600 p-4 text-center">
                  Hover over a card to preview
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
