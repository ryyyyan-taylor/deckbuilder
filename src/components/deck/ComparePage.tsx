import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { TYPE_ORDER, getCardType } from '../../lib/cards'
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
  quantityA?: number
  quantityB?: number
}

export function ComparePage() {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

      // Build name-based maps: name -> { card, totalQuantity }
      const buildNameMap = (cards: ImportedCard[]) => {
        const map = new Map<string, { card: Card; quantity: number }>()
        for (const c of cards) {
          const card = cardMap.get(c.card_id)
          if (!card) continue
          const key = card.name.toLowerCase()
          if (!map.has(key)) {
            map.set(key, { card, quantity: c.quantity })
          } else {
            map.get(key)!.quantity += c.quantity
          }
        }
        return map
      }

      const mapA = buildNameMap(dataA.cards)
      const mapB = buildNameMap(dataB.cards)

      const shared: CompareCard[] = []
      const uniqueA: CompareCard[] = []
      const uniqueB: CompareCard[] = []

      // Cards in A
      for (const [name, { card, quantity }] of mapA) {
        if (mapB.has(name)) {
          shared.push({
            name: card.name,
            card,
            quantityA: quantity,
            quantityB: mapB.get(name)!.quantity,
          })
        } else {
          uniqueA.push({ name: card.name, card, quantityA: quantity })
        }
      }

      // Cards only in B
      for (const [name, { card, quantity }] of mapB) {
        if (!mapA.has(name)) {
          uniqueB.push({ name: card.name, card, quantityB: quantity })
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
          <div className="space-y-8">
            <CompareSection
              title="Shared"
              subtitle={`Cards in both decks`}
              cards={result.shared}
              showBothQuantities
              deckAName={result.deckAName}
              deckBName={result.deckBName}
            />
            <CompareSection
              title={`Unique to ${result.deckAName}`}
              cards={result.uniqueA}
            />
            <CompareSection
              title={`Unique to ${result.deckBName}`}
              cards={result.uniqueB}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function CompareSection({
  title,
  subtitle,
  cards,
  showBothQuantities,
  deckAName,
  deckBName,
}: {
  title: string
  subtitle?: string
  cards: CompareCard[]
  showBothQuantities?: boolean
  deckAName?: string
  deckBName?: string
}) {
  if (cards.length === 0) {
    return (
      <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300">
          {title} <span className="text-gray-500">(0)</span>
        </h3>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
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
      <h3 className="text-sm font-semibold text-gray-300 mb-1">
        {title} <span className="text-gray-500">({cards.length})</span>
      </h3>
      {subtitle && (
        <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
      )}

      <div className="flex flex-wrap justify-center gap-10">
        {sortedGroups.map(({ type, cards: typeCards }) => (
          <div key={type} className="w-[180px]">
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
                  <CompareCardImage
                    card={cc}
                    showBothQuantities={showBothQuantities}
                    deckAName={deckAName}
                    deckBName={deckBName}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompareCardImage({
  card: cc,
  showBothQuantities,
  deckAName,
  deckBName,
}: {
  card: CompareCard
  showBothQuantities?: boolean
  deckAName?: string
  deckBName?: string
}) {
  const imageUrl = cc.card.image_uris?.normal || cc.card.image_uris?.small

  return (
    <div className="relative group">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={cc.card.name}
          className="w-[180px] rounded-lg"
          loading="lazy"
        />
      ) : (
        <div className="w-[180px] h-[252px] bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-400 p-2 text-center">
          {cc.card.name}
        </div>
      )}

      {/* Quantity badge */}
      <div className="absolute top-1 left-1 flex flex-col gap-0.5">
        {showBothQuantities ? (
          <>
            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">
              {deckAName}: {cc.quantityA}x
            </span>
            <span className="bg-purple-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">
              {deckBName}: {cc.quantityB}x
            </span>
          </>
        ) : (
          <span className="bg-gray-900/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">
            {(cc.quantityA ?? cc.quantityB) ?? 1}x
          </span>
        )}
      </div>
    </div>
  )
}
