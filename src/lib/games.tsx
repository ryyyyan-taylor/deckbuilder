export type Game = 'mtg' | 'swu'

export const GAMES: Game[] = ['mtg', 'swu']

export const GAME_LABELS: Record<Game, string> = {
  mtg: 'MTG',
  swu: 'SWU',
}

// Inline SVG icons for segmented control
export const GameIconMtg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    {/* Simple MTG mana symbol approximation: circle with point at top */}
    <circle cx="12" cy="13" r="8" />
    <polygon points="12,4 14,10 10,10" />
  </svg>
)

export const GameIconSwu = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    {/* Simple Star Wars icon: X shape (cross) */}
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export function getFormats(game: Game): string[] {
  if (game === 'mtg') {
    return [
      'Standard',
      'Modern',
      'Pioneer',
      'Legacy',
      'Vintage',
      'Commander',
      'cEDH',
      'Duel Commander',
      'Pauper',
      'Draft',
      'Other',
    ]
  }
  return ['Premier', 'Twin Suns']
}

export function getDefaultSections(game: Game, format: string): string[] {
  if (game === 'swu') {
    return [
      'Leader/Base',
      'Ground Units',
      'Space Units',
      'Events',
      'Upgrades',
      'Sideboard',
      'Stats',
      'Test',
    ]
  }

  // MTG
  const commanderFormats = ['Commander', 'cEDH', 'Duel Commander']
  if (commanderFormats.includes(format)) {
    return ['Commander', 'Mainboard', 'Sideboard', 'Stats', 'Test']
  }
  return ['Mainboard', 'Sideboard', 'Stats', 'Test']
}

export function getProtectedSections(game: Game, format: string): string[] {
  if (game === 'swu') {
    return ['Leader/Base', 'Stats', 'Test']
  }

  // MTG
  const base = ['Mainboard', 'Stats', 'Test']
  const commanderFormats = ['Commander', 'cEDH', 'Duel Commander']
  return commanderFormats.includes(format) ? [...base, 'Commander'] : base
}

export function getMainSections(game: Game): string[] {
  if (game === 'swu') {
    return ['Ground Units', 'Space Units', 'Events', 'Upgrades']
  }
  return ['Mainboard']
}
