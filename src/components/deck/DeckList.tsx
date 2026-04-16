import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDeck } from '../../hooks/useDeck'
import type { Deck } from '../../hooks/useDeck'
import { scryfallArtCropUrl } from '../../lib/cards'

function artUrl(deck: Deck): string | null {
  const dc = deck.display_card
  if (!dc) return null
  if (dc.image_uris?.art_crop) return dc.image_uris.art_crop
  if (dc.scryfall_id) return scryfallArtCropUrl(dc.scryfall_id)
  return dc.image_uris?.normal ?? null
}

export function DeckList() {
  const { decks, loading, error, fetchDecks, deleteDeck } = useDeck()
  const [searchParams, setSearchParams] = useSearchParams()
  const formatFilter = searchParams.get('format')

  useEffect(() => {
    document.title = formatFilter
      ? `${formatFilter} Decks — Deck Builder`
      : 'My Decks — Deck Builder'
    fetchDecks()
  // fetchDecks is not memoized in useDeck — adding it would cause this effect to
  // re-run on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatFilter])

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    await deleteDeck(id)
  }

  const formatGroups = useMemo(() => {
    const groups = new Map<string, typeof decks>()
    for (const deck of decks) {
      const fmt = deck.format || 'Unformatted'
      const list = groups.get(fmt)
      if (list) list.push(deck)
      else groups.set(fmt, [deck])
    }
    return groups
  }, [decks])

  const filteredDecks = useMemo(() => {
    if (!formatFilter) return []
    return decks.filter((d) =>
      formatFilter === 'Unformatted' ? !d.format : d.format === formatFilter
    )
  }, [decks, formatFilter])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <Link
          to="/decks/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium text-sm"
        >
          New Deck
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : decks.length === 0 ? (
        <p className="text-gray-400">No decks yet. Create one to get started!</p>
      ) : formatFilter ? (
        /* Filtered deck list for a specific format — art grid */
        <>
          <button
            onClick={() => setSearchParams({})}
            className="text-sm text-gray-400 hover:text-gray-200 mb-4 flex items-center gap-1"
          >
            &larr; All Formats
          </button>
          <h2 className="text-lg font-semibold mb-4">{formatFilter}</h2>
          {filteredDecks.length === 0 ? (
            <p className="text-gray-400">No decks in this format.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDecks.map((deck) => {
                const art = artUrl(deck)
                return (
                  <div key={deck.id} className="relative group rounded-lg overflow-hidden aspect-video bg-gray-800">
                    {art ? (
                      <img
                        src={art}
                        alt={deck.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <Link
                      to={`/decks/${deck.id}/edit`}
                      className="absolute inset-0 flex flex-col justify-end p-3 hover:ring-2 hover:ring-blue-500 rounded-lg transition-all"
                    >
                      <div className="font-semibold text-white text-sm leading-tight">{deck.name}</div>
                      <div className="text-xs text-gray-300 mt-0.5">
                        {new Date(deck.updated_at).toLocaleDateString()}
                      </div>
                    </Link>
                    <button
                      onClick={() => handleDelete(deck.id, deck.name)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-red-900/80 text-red-400 hover:text-red-200 text-xs px-2 py-1 rounded"
                    >
                      Delete
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* Format folders overview */
        <div className="space-y-2">
          {[...formatGroups.entries()].map(([format, groupDecks]) => (
            <button
              key={format}
              onClick={() => setSearchParams({ format })}
              className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-4 py-4 hover:border-gray-500 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                <span className="font-medium">{format}</span>
              </div>
              <span className="text-sm text-gray-400">
                {groupDecks.length} {groupDecks.length === 1 ? 'deck' : 'decks'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
