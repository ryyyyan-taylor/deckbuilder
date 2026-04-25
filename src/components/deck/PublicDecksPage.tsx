import { useEffect, useRef, useReducer } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { scryfallArtCropUrl } from '../../lib/cards'
import { GameToggle } from '../GameToggle'
import { useSelectedGame } from '../../hooks/useSelectedGame'

const PAGE_SIZE = 20

type DisplayCard = { scryfall_id?: string; image_uris: { art_crop?: string; normal?: string } | null } | null

type RawDeck = {
  id: string
  name: string
  format: string | null
  updated_at: string
  display_card: DisplayCard | DisplayCard[]
}

type PublicDeck = {
  id: string
  name: string
  format: string | null
  updated_at: string
  display_card: DisplayCard
}

type State = {
  decks: PublicDeck[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string | null
}

type Action =
  | { type: 'FETCH_START'; append: boolean }
  | { type: 'FETCH_SUCCESS'; rows: PublicDeck[]; append: boolean }
  | { type: 'FETCH_ERROR'; message: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return action.append
        ? { ...state, loadingMore: true }
        : { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return {
        ...state,
        loading: false,
        loadingMore: false,
        hasMore: action.rows.length === PAGE_SIZE,
        decks: action.append ? [...state.decks, ...action.rows] : action.rows,
      }
    case 'FETCH_ERROR':
      return { ...state, loading: false, loadingMore: false, error: action.message }
    default:
      return state
  }
}

const initialState: State = {
  decks: [],
  loading: true,
  loadingMore: false,
  hasMore: true,
  error: null,
}

function artUrl(deck: PublicDeck): string | null {
  const dc = deck.display_card
  if (!dc) return null
  if (dc.image_uris?.art_crop) return dc.image_uris.art_crop
  if (dc.scryfall_id) return scryfallArtCropUrl(dc.scryfall_id)
  return dc.image_uris?.normal ?? null
}

export function PublicDecksPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { decks, loading, loadingMore, hasMore, error } = state
  const sentinelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const selectedGame = useSelectedGame()

  useEffect(() => {
    document.title = 'Public Decks — Deck Builder'
  }, [])

  async function fetchPage(offset: number, append: boolean) {
    dispatch({ type: 'FETCH_START', append })

    const { data, error: err } = await supabase
      .from('decks')
      .select('id, name, format, updated_at, display_card:cards!display_card_id(scryfall_id, image_uris)')
      .eq('is_public', true)
      .eq('game', selectedGame)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (err) {
      dispatch({ type: 'FETCH_ERROR', message: err.message })
      return
    }

    // Normalize display_card: Supabase may return it as an array for FK joins
    const rows: PublicDeck[] = (data as RawDeck[]).map((d) => ({
      ...d,
      display_card: Array.isArray(d.display_card) ? (d.display_card[0] ?? null) : d.display_card,
    }))
    offsetRef.current = offset + rows.length
    dispatch({ type: 'FETCH_SUCCESS', rows, append })
  }

  useEffect(() => {
    offsetRef.current = 0
    fetchPage(0, false)
  // fetchPage is defined inline and recreated every render — adding it would cause
  // an infinite loop. selectedGame is the only meaningful dependency here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGame])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchPage(offsetRef.current, true)
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  // fetchPage is defined inline — omitted intentionally to avoid infinite loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, loading])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Public Decks</h1>
        <GameToggle />
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : decks.length === 0 ? (
        <p className="text-gray-400">No public {selectedGame === 'mtg' ? 'MTG' : 'SWU'} decks yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {decks.map((deck) => {
              const art = artUrl(deck)
              return (
                <Link
                  key={deck.id}
                  to={`/deck/${deck.id}`}
                  className="relative block rounded-lg overflow-hidden aspect-video bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all"
                >
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
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="font-semibold text-white text-sm leading-tight">{deck.name}</div>
                    {deck.format && (
                      <div className="text-xs text-gray-300 mt-0.5">{deck.format}</div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>

          <div ref={sentinelRef} className="h-8 flex items-center justify-center mt-6">
            {loadingMore && <p className="text-gray-400 text-sm">Loading more...</p>}
            {!hasMore && decks.length > 0 && (
              <p className="text-gray-600 text-sm">All decks loaded</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
