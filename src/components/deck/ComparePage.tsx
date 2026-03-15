import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { TYPE_ORDER, getCardType, packColumns } from '../../lib/cards'
import type { Card } from '../../hooks/useDeck'

interface ImportedCard {
  card_id: string
  section: string
  quantity: number
}

interface ImportResult {
  name: string
  cards: ImportedCard[]
}

interface CompareCard {
  name: string
  card: Card
}

export function ComparePage() {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [result, setResult] = useState<{
    deckAName: string
    deckBName: string
    shared: CompareCard[]
    uniqueA: CompareCard[]
    uniqueB: CompareCard[]
  } | null>(null)

  const handleCompare = async () => {
    if (!urlA.trim() || !urlB.trim()) {
      setError('Please enter both deck URLs')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const [resA, resB] = await Promise.all([
        fetch('/api/import/moxfield', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlA.trim() }),
        }),
        fetch('/api/import/moxfield', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlB.trim() }),
        }),
      ])

      if (!resA.ok || !resB.ok) {
        const errA = !resA.ok ? await resA.json() : null
        const errB = !resB.ok ? await resB.json() : null
        setError(
          errA?.error || errB?.error || 'Failed to import one or both decks'
        )
        return
      }

      const dataA: ImportResult = await resA.json()
      const dataB: ImportResult = await resB.json()

      // Collect all unique card_ids
      const allCardIds = [
        ...new Set([
          ...dataA.cards.map((c) => c.card_id),
          ...dataB.cards.map((c) => c.card_id),
        ]),
      ]

      if (allCardIds.length === 0) {
        setError('Both decks appear to be empty')
        return
      }

      // Fetch card data from Supabase in batches of 100
      const cardMap = new Map<string, Card>()
      for (let i = 0; i < allCardIds.length; i += 100) {
        const batch = allCardIds.slice(i, i + 100)
        const { data } = await supabase
          .from('cards')
          .select('*')
          .in('id', batch)
        if (data) {
          for (const card of data) {
            cardMap.set(card.id, card as Card)
          }
        }
      }

      // Build name-based sets
      const buildNameMap = (cards: ImportedCard[]) => {
        const map = new Map<string, Card>()
        for (const c of cards) {
          const card = cardMap.get(c.card_id)
          if (!card) continue
          const key = card.name.toLowerCase()
          if (!map.has(key)) {
            map.set(key, card)
          }
        }
        return map
      }

      const mapA = buildNameMap(dataA.cards)
      const mapB = buildNameMap(dataB.cards)

      const shared: CompareCard[] = []
      const uniqueA: CompareCard[] = []
      const uniqueB: CompareCard[] = []

      for (const [name, card] of mapA) {
        if (mapB.has(name)) {
          shared.push({ name: card.name, card })
        } else {
          uniqueA.push({ name: card.name, card })
        }
      }

      for (const [name, card] of mapB) {
        if (!mapA.has(name)) {
          uniqueB.push({ name: card.name, card })
        }
      }

      setResult({
        deckAName: dataA.name || 'Deck A',
        deckBName: dataB.name || 'Deck B',
        shared,
        uniqueA,
        uniqueB,
      })
    } catch {
      setError('An error occurred while comparing decks')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            to="/decks"
            className="text-gray-400 hover:text-white text-sm"
          >
            &larr; Back
          </Link>
          <h1 className="text-2xl font-bold">Compare Decks</h1>
        </div>

        <div className="max-w-2xl mb-8">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              placeholder="Moxfield deck URL (Deck A)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="Moxfield deck URL (Deck B)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCompare}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm shrink-0"
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="flex gap-6">
            <div className="flex-1 min-w-0 space-y-8">
              <CompareSection
                title="Shared"
                cards={result.shared}
                onHoverCard={setPreviewCard}
              />
              <CompareSection
                title={`Unique to ${result.deckAName}`}
                cards={result.uniqueA}
                onHoverCard={setPreviewCard}
              />
              <CompareSection
                title={`Unique to ${result.deckBName}`}
                cards={result.uniqueB}
                onHoverCard={setPreviewCard}
              />
            </div>

            {/* Sticky preview panel */}
            <div className="w-[300px] shrink-0 hidden lg:block">
              <div className="sticky top-[25vh]">
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
        )}
      </div>
    </div>
  )
}

function CompareSection({
  title,
  cards,
  onHoverCard,
}: {
  title: string
  cards: CompareCard[]
  onHoverCard: (card: Card | null) => void
}) {
  if (cards.length === 0) {
    return (
      <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300">
          {title} <span className="text-gray-500">(0)</span>
        </h3>
        <p className="text-gray-600 text-xs py-4">No cards</p>
      </div>
    )
  }

  // Group by type
  const grouped = new Map<string, CompareCard[]>()
  for (const cc of cards) {
    const type = getCardType(cc.card.type_line)
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type)!.push(cc)
  }

  const sortedGroups = TYPE_ORDER.filter((t) => grouped.has(t)).map((t) => ({
    type: t,
    cards: grouped.get(t)!.sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return (
    <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        {title} <span className="text-gray-500">({cards.length})</span>
      </h3>

      <div className="flex flex-wrap justify-center gap-10">
        {packColumns(sortedGroups).map((column, colIdx) => (
          <div key={colIdx} className="w-[180px] flex flex-col gap-4">
            {column.map(({ type, cards: typeCards }) => (
              <div key={type}>
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  {type}{' '}
                  <span className="text-gray-600">({typeCards.length})</span>
                </h4>
                <div className="flex flex-col">
                  {typeCards.map((cc, i) => (
                    <div
                      key={cc.card.id}
                      className={`relative ${i > 0 ? 'mt-[-238px]' : ''}`}
                      style={{ zIndex: i }}
                    >
                      <div
                        className="w-[200px]"
                        onMouseEnter={() => onHoverCard(cc.card)}
                      >
                        {cc.card.image_uris?.normal ? (
                          <img
                            src={cc.card.image_uris.normal}
                            alt={cc.card.name}
                            className="w-full rounded-lg"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-400 p-2 text-center">
                            {cc.card.name}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
