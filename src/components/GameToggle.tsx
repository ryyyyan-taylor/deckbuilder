import { useSearchParams } from 'react-router-dom'
import type { Game } from '../lib/games'
import { GAMES, GAME_LABELS, GameIconMtg, GameIconSwu } from '../lib/games'

interface GameToggleProps {
  onChange?: (game: Game) => void
}

export function GameToggle({ onChange }: GameToggleProps) {
  const [params, setParams] = useSearchParams()
  const urlGame = params.get('game') as Game | null
  const storedGame = (localStorage.getItem('preferredGame') as Game) || 'mtg'
  const game: Game = urlGame ?? storedGame

  const select = (g: Game) => {
    const next = new URLSearchParams(params)
    next.set('game', g)
    setParams(next)
    localStorage.setItem('preferredGame', g)
    onChange?.(g)
  }

  return (
    <div className="flex items-center bg-gray-800 border border-gray-700 rounded text-sm">
      {GAMES.map((g) => {
        const Icon = g === 'mtg' ? GameIconMtg : GameIconSwu
        return (
          <button
            key={g}
            onClick={() => select(g)}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${
              g === 'mtg' ? 'rounded-l' : 'rounded-r'
            } ${
              game === g
                ? 'bg-gray-600 text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" /> {GAME_LABELS[g]}
          </button>
        )
      })}
    </div>
  )
}

export function useSelectedGame(): Game {
  const [params] = useSearchParams()
  const urlGame = params.get('game') as Game | null
  if (urlGame === 'mtg' || urlGame === 'swu') return urlGame
  const stored = localStorage.getItem('preferredGame') as Game | null
  return stored === 'swu' ? 'swu' : 'mtg'
}
