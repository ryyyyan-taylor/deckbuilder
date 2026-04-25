import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { GameToggle } from '../GameToggle'
import { useSelectedGame } from '../../hooks/useSelectedGame'

export function UtilitiesPage() {
  const selectedGame = useSelectedGame()

  useEffect(() => {
    document.title = 'Utilities — Deck Builder'
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Utilities</h1>
        <GameToggle />
      </div>
      <div className="space-y-3">
        <Link
          to={`/compare?game=${selectedGame}`}
          className="flex items-center gap-4 bg-gray-800 border border-gray-700 rounded px-4 py-4 hover:border-gray-500 transition-colors"
        >
          <div className="text-2xl">&#x2194;</div>
          <div>
            <div className="font-medium text-blue-400">Compare Decks</div>
            <div className="text-sm text-gray-400">
              Compare decks side-by-side to see shared and unique cards
            </div>
          </div>
        </Link>
        <Link
          to={`/sandbox?game=${selectedGame}`}
          className="flex items-center gap-4 bg-gray-800 border border-gray-700 rounded px-4 py-4 hover:border-gray-500 transition-colors"
        >
          <div className="text-2xl">&#x1F3D6;</div>
          <div>
            <div className="font-medium text-blue-400">Deck Sandbox</div>
            <div className="text-sm text-gray-400">
              Build and explore decks without saving — persists until you close the tab
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
