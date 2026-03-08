import { useState, useRef, useEffect } from 'react'
import type { Card } from '../../hooks/useDeck'

interface CardSearchProps {
  onAdd: (card: Card, section: string) => void
  sections: string[]
  activeSection: string
  onHoverCard?: (card: Card | null) => void
}

export function CardSearch({ onAdd, sections, activeSection, onHoverCard }: CardSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState(activeSection)
  const [expanded, setExpanded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    setSection(activeSection)
  }, [activeSection])

  const search = async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Search failed')
      }
      const json = await res.json()
      setResults(json.data ?? [])
      setExpanded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  const handleAdd = (card: Card) => {
    onAdd(card, section)
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Search cards to add..."
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => results.length > 0 && setExpanded(true)}
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-sm"
          />
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-sm"
          >
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {results.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-300 text-xs shrink-0"
          >
            {expanded ? 'Hide results' : `Show results (${results.length})`}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded text-sm mt-2">
          {error}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm mt-2">Searching...</p>}

      {expanded && results.length > 0 && (
        <div className="relative flex gap-4 mt-3">
          <ul className="flex-1 space-y-1 max-h-64 overflow-y-auto">
            {results.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border border-gray-700 rounded hover:border-gray-500 cursor-pointer text-sm"
                onMouseEnter={() => onHoverCard?.(card)}
                onClick={() => handleAdd(card)}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-medium">{card.name}</span>
                  {card.mana_cost && (
                    <span className="text-gray-400">{card.mana_cost}</span>
                  )}
                  {card.type_line && (
                    <span className="text-gray-500 text-xs truncate hidden sm:inline">{card.type_line}</span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAdd(card)
                  }}
                  className="text-blue-400 hover:text-blue-300 text-xs ml-2 shrink-0"
                >
                  + Add
                </button>
              </li>
            ))}
          </ul>

        </div>
      )}
    </div>
  )
}
