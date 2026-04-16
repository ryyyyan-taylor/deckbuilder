import { useEffect, useRef, useReducer } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE_SIZE = 20

type PublicDeck = {
  id: string
  name: string
  format: string | null
  updated_at: string
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

export function PublicDecksPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { decks, loading, loadingMore, hasMore, error } = state
  const sentinelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)

  useEffect(() => {
    document.title = 'Public Decks — Deck Builder'
  }, [])

  async function fetchPage(offset: number, append: boolean) {
    dispatch({ type: 'FETCH_START', append })

    const { data, error: err } = await supabase
      .from('decks')
      .select('id, name, format, updated_at')
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (err) {
      dispatch({ type: 'FETCH_ERROR', message: err.message })
      return
    }

    const rows = data as PublicDeck[]
    offsetRef.current = offset + rows.length
    dispatch({ type: 'FETCH_SUCCESS', rows, append })
  }

  useEffect(() => {
    offsetRef.current = 0
    fetchPage(0, false)
  }, [])

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
  }, [hasMore, loadingMore, loading])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">Public Decks</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : decks.length === 0 ? (
        <p className="text-gray-400">No public decks yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {decks.map((deck) => (
              <Link
                key={deck.id}
                to={`/deck/${deck.id}`}
                className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-4 py-3 hover:border-gray-500 transition-colors"
              >
                <div className="min-w-0">
                  <span className="text-blue-400 font-medium">{deck.name}</span>
                  {deck.format && (
                    <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                      {deck.format}
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-400 shrink-0 ml-4">
                  {new Date(deck.updated_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>

          <div ref={sentinelRef} className="h-8 flex items-center justify-center mt-4">
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
