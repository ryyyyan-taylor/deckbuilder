import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useDeck } from '../../hooks/useDeck'

export function DeckList() {
  const { signOut } = useAuth()
  const { decks, loading, error, fetchDecks, deleteDeck } = useDeck()

  useEffect(() => {
    fetchDecks()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    await deleteDeck(id)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Decks</h1>
          <div className="flex gap-3">
            <Link
              to="/decks/new"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium text-sm"
            >
              New Deck
            </Link>
            <button
              onClick={signOut}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm"
            >
              Log Out
            </button>
          </div>
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
        ) : (
          <div className="space-y-2">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to={`/decks/${deck.id}/edit`}
                    className="text-blue-400 hover:underline font-medium"
                  >
                    {deck.name}
                  </Link>
                  <div className="flex gap-3 text-sm text-gray-400 mt-1">
                    {deck.format && (
                      <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">
                        {deck.format}
                      </span>
                    )}
                    <span>
                      {new Date(deck.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(deck.id, deck.name)}
                  className="text-red-400 hover:text-red-300 text-sm ml-4 shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
