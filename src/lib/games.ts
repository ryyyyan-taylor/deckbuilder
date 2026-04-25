// Re-export icons from separate file to satisfy fast-refresh linter
export { GameIconMtg, GameIconSwu } from './gameIcons'

export type Game = 'mtg' | 'swu'

export const GAMES: Game[] = ['mtg', 'swu']

export const GAME_LABELS: Record<Game, string> = {
  mtg: 'MTG',
  swu: 'SWU',
}

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
    return ['Leader/Base', 'Mainboard', 'Sideboard', 'Stats', 'Test']
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
    return ['Leader/Base', 'Mainboard', 'Stats', 'Test']
  }

  // MTG
  const base = ['Mainboard', 'Stats', 'Test']
  const commanderFormats = ['Commander', 'cEDH', 'Duel Commander']
  return commanderFormats.includes(format) ? [...base, 'Commander'] : base
}

export function getMainSections(game: Game): string[] {
  return ['Mainboard']
}
