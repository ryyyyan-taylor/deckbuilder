import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { TYPE_ORDER, getCardType, packColumns } from '../../lib/cards'
import { useMaxColumns } from '../../hooks/useMaxColumns'
import { useAuth } from '../../hooks/useAuth'
import type { Card, Deck } from '../../hooks/useDeck'

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

interface Slot {
  type: 'saved' | 'moxfield'
  deckId: string
  url: string
}

const MAIN_SECTIONS = new Set(['Commander', 'Mainboard'])

export function ComparePage() {
  const { user } = useAuth()
  const [slots, setSlots] = useState<Slot[]>([
    { type: 'saved', deckId: '', url: '' },
    { type: 'saved', deckId: '', url: '' },
  ])
  const [savedDecks, setSavedDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [result, setResult] = useState<{
    deckNames: string[]
    shared: CompareCard[]
    unique: { name: string; cards: CompareCard[] }[]
  } | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('decks')
      .select('id, user_id, name, format, description, is_public, sections, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSavedDecks(data as Deck[])
      })
  }, [user])

  const updateSlotType = (index: number, type: Slot['type']) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, type, deckId: '', url: '' } : s))
    )
  }

  const updateSlotDeck = (index: number, deckId: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, deckId } : s))
    )
  }

  const updateSlotUrl = (index: number, url: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, url } : s))
    )
  }

  const addSlot = () => setSlots((prev) => [...prev, { type: 'saved', deckId: '', url: '' }])

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index))
  }

  const fetchSavedDeck = async (deckId: string): Promise<ImportResult> => {
    const deck = savedDecks.find((d) => d.id === deckId)!
    const { data, error } = await supabase
      .from('deck_cards')
      .select('card_id, section, quantity')
      .eq('deck_id', deckId)
    if (error) throw new Error(`Failed to load deck "${deck.name}"`)
    return { name: deck.name, cards: (data || []) as ImportedCard[] }
  }

  const handleCompare = async () => {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      if (s.type === 'saved' && !s.deckId) {
        setError(`Please select a deck for slot ${i + 1}`)
        return
      }
      if (s.type === 'moxfield' && !s.url.trim()) {
        setError(`Please enter a Moxfield URL for slot ${i + 1}`)
        return
      }
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const decks: ImportResult[] = await Promise.all(
        slots.map(async (s, i) => {
          if (s.type === 'saved') {
            return fetchSavedDeck(s.deckId)
          }
          const res = await fetch('/api/import/moxfield', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: s.url.trim() }),
          })
          if (!res.ok) {
            const errData = await res.json()
            throw new Error(errData?.error || `Failed to import Deck ${i + 1}`)
          }
          return res.json() as Promise<ImportResult>
        })
      )

      // DEBUG: raw import results
      decks.forEach((d, i) => {
        const source = slots[i].type === 'saved' ? 'saved' : 'moxfield'
        const sections = [...new Set(d.cards.map((c) => c.section))].sort().join(', ')
        console.log(`[compare] deck ${i} "${d.name}" (${source}): ${d.cards.length} rows, sections: ${sections}`)
      })

      // Collect all unique card_ids
      const allCardIds = [
        ...new Set(decks.flatMap((d) => d.cards.map((c) => c.card_id))),
      ]

      console.log(`[compare] total unique card_ids: ${allCardIds.length}`)

      if (allCardIds.length === 0) {
        setError('All decks appear to be empty')
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

      console.log(`[compare] cardMap resolved ${cardMap.size} cards from DB`)

      // Build name-based sets for each deck (mainboard + commander only)
      const buildNameMap = (cards: ImportedCard[], label: string) => {
        const map = new Map<string, Card>()
        const missing: string[] = []
        const dupes: string[] = []
        const mainCards = cards.filter((c) => MAIN_SECTIONS.has(c.section))
        const skipped = cards.filter((c) => !MAIN_SECTIONS.has(c.section))
        console.log(`[compare] ${label}: ${cards.length} rows → ${mainCards.length} main (skipped ${skipped.length} from: ${[...new Set(skipped.map(c => c.section))].join(', ') || 'none'})`)
        for (const c of mainCards) {
          const card = cardMap.get(c.card_id)
          if (!card) {
            missing.push(c.card_id)
            continue
          }
          const key = card.name.toLowerCase()
          if (map.has(key)) {
            dupes.push(card.name)
          } else {
            map.set(key, card)
          }
        }
        if (missing.length) console.warn(`[compare] ${label}: ${missing.length} card_ids missing from DB: ${missing.join(', ')}`)
        if (dupes.length) console.log(`[compare] ${label}: ${dupes.length} duplicate names collapsed: ${dupes.sort().join(', ')}`)
        console.log(`[compare] ${label}: ${map.size} unique names: ${[...map.keys()].sort().join(', ')}`)
        return map
      }

      const deckNames = decks.map((d, i) => d.name || `Deck ${i + 1}`)
      const nameMaps = decks.map((d, i) => buildNameMap(d.cards, `"${deckNames[i]}"`))

      // Shared = cards present in ALL decks
      const allNames = new Set(nameMaps.flatMap((m) => [...m.keys()]))
      const shared: CompareCard[] = []
      for (const name of allNames) {
        if (nameMaps.every((m) => m.has(name))) {
          const card = nameMaps[0].get(name)!
          shared.push({ name: card.name, card })
        }
      }

      console.log(`[compare] shared (${shared.length}): ${shared.map((c) => c.name).sort().join(', ')}`)

      // Unique per deck = cards NOT in all other decks
      const unique = nameMaps.map((map, idx) => {
        const cards: CompareCard[] = []
        for (const [name, card] of map) {
          const inOthers = nameMaps.every(
            (m, i) => i === idx || m.has(name)
          )
          if (!inOthers) {
            cards.push({ name: card.name, card })
          }
        }
        console.log(`[compare] unique to "${deckNames[idx]}" (${cards.length}): ${cards.map((c) => c.name).sort().join(', ')}`)
        return { name: deckNames[idx], cards }
      })

      setResult({ deckNames, shared, unique })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while comparing decks')
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
          <div className="flex flex-col gap-3 mb-4">
            {slots.map((slot, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={slot.type}
                  onChange={(e) => updateSlotType(i, e.target.value as Slot['type'])}
                  className="w-28 shrink-0 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="saved">My Deck</option>
                  <option value="moxfield">Moxfield</option>
                </select>

                {slot.type === 'saved' ? (
                  <DeckSearchInput
                    decks={savedDecks}
                    value={slot.deckId}
                    onChange={(id) => updateSlotDeck(i, id)}
                  />
                ) : (
                  <input
                    type="text"
                    value={slot.url}
                    onChange={(e) => updateSlotUrl(i, e.target.value)}
                    placeholder="https://www.moxfield.com/decks/..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                )}

                {slots.length > 2 && (
                  <button
                    onClick={() => removeSlot(i)}
                    className="px-2 text-gray-500 hover:text-red-400 text-lg shrink-0"
                    title="Remove"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-3">
              <button
                onClick={addSlot}
                className="px-3 py-2 border border-dashed border-gray-600 rounded text-sm text-gray-400 hover:text-gray-300 hover:border-gray-500"
              >
                + Add Deck
              </button>
              <button
                onClick={handleCompare}
                disabled={loading || slots.length < 2}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm"
              >
                {loading ? 'Comparing...' : 'Compare'}
              </button>
            </div>
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
              {result.unique.map((u, i) => (
                <CompareSection
                  key={i}
                  title={`Unique to ${u.name}`}
                  cards={u.cards}
                  onHoverCard={setPreviewCard}
                />
              ))}
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

function DeckSearchInput({
  decks,
  value,
  onChange,
}: {
  decks: Deck[]
  value: string
  onChange: (deckId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const label = (d: Deck) => `${d.name}${d.format ? ` (${d.format})` : ''}`
  const selected = decks.find((d) => d.id === value)
  const filtered = query
    ? decks.filter((d) => label(d).toLowerCase().includes(query.toLowerCase()))
    : decks

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={open ? query : (selected ? label(selected) : '')}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        placeholder="Search your decks..."
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((d) => (
              <div
                key={d.id}
                onMouseDown={() => { onChange(d.id); setOpen(false) }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 ${d.id === value ? 'text-blue-400' : ''}`}
              >
                {label(d)}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">No decks found</div>
          )}
        </div>
      )}
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
  const { ref: containerRef, maxColumns } = useMaxColumns()

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

      <div ref={containerRef} className="flex flex-wrap justify-center gap-10">
        {packColumns(sortedGroups, maxColumns).map((column, colIdx) => (
          <div key={colIdx} className="w-[180px] min-w-0 flex flex-col gap-4">
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
                      className={`relative ${i > 0 ? 'mt-[-247px]' : ''}`}
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
