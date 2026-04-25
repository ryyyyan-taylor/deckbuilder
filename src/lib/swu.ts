// Star Wars: Unlimited card type and aspect constants

export const SWU_TYPES = ['Leader', 'Base', 'Unit', 'Event', 'Upgrade'] as const
export const SWU_TYPE_ORDER = ['Leader', 'Base', 'Ground Unit', 'Space Unit', 'Event', 'Upgrade', 'Other'] as const

export const SWU_ASPECTS = [
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Heroism',
  'Villainy',
] as const
export type SwuAspect = typeof SWU_ASPECTS[number]

// Aspect colors for stat panel pips — verified hex codes
export const ASPECT_COLORS: Record<SwuAspect, string> = {
  Vigilance: '#3b82f6', // blue
  Command: '#10b981', // green
  Aggression: '#ef4444', // red
  Cunning: '#f59e0b', // amber/yellow
  Heroism: '#e5e7eb', // gray/white
  Villainy: '#1f2937', // gray/black
}

export interface SwuCardData {
  swu_type?: string | null
  arena?: string | null
  aspects?: string[] | null
  cost?: number | null
  hp?: number | null
  power?: number | null
}

// Splits generic 'Unit' into 'Ground Unit' / 'Space Unit' based on arena field
export function getSwuCardType(card: SwuCardData): string {
  const t = card.swu_type ?? 'Other'
  if (t === 'Unit') {
    if (card.arena === 'Ground') return 'Ground Unit'
    if (card.arena === 'Space') return 'Space Unit'
    return 'Unit'
  }
  if (SWU_TYPES.includes(t as typeof SWU_TYPES[number])) return t
  return 'Other'
}
