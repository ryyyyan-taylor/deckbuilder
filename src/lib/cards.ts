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
 * Only combines groups into shared columns when doing so actually saves
 * vertical space (reduces total column count without exceeding the tallest
 * single group's height). Groups are sorted tallest-first for better
 * packing, which may reorder sections from TYPE_ORDER.
 */
export function packColumns<T extends TypeGroup>(groups: T[]): T[][] {
  if (groups.length === 0) return []

  // Height target: the tallest single group
  const tallest = Math.max(...groups.map((g) => groupHeight(g.cards.length)))

  // Sort by height descending for better bin-packing (tall groups first)
  const sorted = [...groups].sort(
    (a, b) => groupHeight(b.cards.length) - groupHeight(a.cards.length)
  )

  const columns: { groups: T[]; height: number }[] = []

  for (const group of sorted) {
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

  // Only use packed layout if it actually saves columns
  if (columns.length >= groups.length) {
    return groups.map((g) => [g])
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
