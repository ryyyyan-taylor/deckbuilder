export const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Sorcery', 'Instant', 'Enchantment', 'Artifact', 'Land', 'Other']

/** Height constants for card column stacking (in px) */
const CARD_FULL_HEIGHT = 280
const CARD_OVERLAP = 238
const CARD_VISIBLE = CARD_FULL_HEIGHT - CARD_OVERLAP // 42px per additional card
const TYPE_HEADER_HEIGHT = 28
const GROUP_GAP = 16

interface TypeGroup {
  type: string
  cards: { length: number }[] | readonly unknown[]
}

function groupHeight(cardCount: number): number {
  return TYPE_HEADER_HEIGHT + CARD_FULL_HEIGHT + Math.max(0, cardCount - 1) * CARD_VISIBLE
}

/**
 * Pack type groups into columns for efficient vertical space usage.
 * Processes groups in their given order (TYPE_ORDER), placing each into
 * the shortest column that has room, preserving left-to-right ordering.
 */
export function packColumns<T extends TypeGroup>(groups: T[]): T[][] {
  if (groups.length === 0) return []

  // First pass: determine the tallest single group (our height target)
  const tallest = Math.max(...groups.map((g) => groupHeight(g.cards.length)))

  const columns: { groups: T[]; height: number }[] = []

  for (const group of groups) {
    const h = groupHeight(group.cards.length)

    // Find the shortest column where this group fits without exceeding tallest
    let bestIdx = -1
    let bestHeight = Infinity

    for (let i = 0; i < columns.length; i++) {
      const newHeight = columns[i].height + GROUP_GAP + h
      if (newHeight <= tallest + GROUP_GAP && columns[i].height < bestHeight) {
        bestHeight = columns[i].height
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      columns[bestIdx].groups.push(group)
      columns[bestIdx].height += GROUP_GAP + h
    } else {
      columns.push({ groups: [group], height: h })
    }
  }

  return columns.map((c) => c.groups)
}

export function getCardType(typeLine: string | null): string {
  if (!typeLine) return 'Other'
  const main = typeLine.split(' — ')[0]
  if (main.includes('Land')) return 'Land'
  if (main.includes('Creature')) return 'Creature'
  if (main.includes('Planeswalker')) return 'Planeswalker'
  if (main.includes('Battle')) return 'Battle'
  if (main.includes('Instant')) return 'Instant'
  if (main.includes('Sorcery')) return 'Sorcery'
  if (main.includes('Enchantment')) return 'Enchantment'
  if (main.includes('Artifact')) return 'Artifact'
  return 'Other'
}
