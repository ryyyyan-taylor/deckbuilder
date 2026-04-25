import { useState } from 'react'
import type { Deck, DeckInput } from '../../hooks/useDeck'
import type { Game } from '../../lib/games'
import { getFormats, getDefaultSections } from '../../lib/games'

interface DeckFormProps {
  deck?: Deck
  game?: Game
  onSubmit: (data: DeckInput) => Promise<void>
  onCancel?: () => void
}

export function DeckForm({ deck, game = 'mtg', onSubmit, onCancel }: DeckFormProps) {
  const formats = getFormats(game)
  const [name, setName] = useState(deck?.name ?? '')
  const [format, setFormat] = useState(deck?.format ?? formats[0])
  const [description, setDescription] = useState(deck?.description ?? '')
  const [isPublic, setIsPublic] = useState(deck?.is_public ?? false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        name, format, description, is_public: isPublic,
        ...(!deck ? { game, sections: getDefaultSections(game, format) } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
        >
          {formats.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="rounded border-gray-700"
        />
        Public deck
      </label>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium"
        >
          {submitting ? 'Saving...' : deck ? 'Save Changes' : 'Create Deck'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
