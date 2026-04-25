import { useSearchParams } from 'react-router-dom'
import type { Game } from '../lib/games'

export function useSelectedGame(): Game {
  const [params] = useSearchParams()
  const urlGame = params.get('game') as Game | null
  if (urlGame === 'mtg' || urlGame === 'swu') return urlGame
  const stored = localStorage.getItem('preferredGame') as Game | null
  return stored === 'swu' ? 'swu' : 'mtg'
}
