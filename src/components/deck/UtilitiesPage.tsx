import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function UtilitiesPage() {
  useEffect(() => {
    document.title = 'Utilities — Deck Builder'
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">Utilities</h1>
      <div className="space-y-3">
        <Link
          to="/compare"
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
          to="/sandbox"
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
