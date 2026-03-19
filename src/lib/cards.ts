export const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Sorcery', 'Instant', 'Enchantment', 'Artifact', 'Land', 'Other']

/** Height constants for card column stacking (in px) */
const CARD_FULL_HEIGHT = 280
const CARD_OVERLAP = 247
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

/** Layout constants exported for container width calculations */
export const COLUMN_WIDTH = 180
export const COLUMN_GAP = 40

/**
 * Pack type groups into columns to fit within maxColumns.
 * Only packs when the number of groups exceeds maxColumns;
 * otherwise each group gets its own column in TYPE_ORDER.
 */
export function packColumns<T extends TypeGroup>(groups: T[], maxColumns: number): T[][] {
  if (groups.length === 0) return []

  // No packing needed — everything fits
  if (groups.length <= maxColumns) {
    return groups.map((g) => [g])
  }

  // Height target: the tallest single group
  const tallest = Math.max(...groups.map((g) => groupHeight(g.cards.length)))

  const columns: { groups: T[]; height: number }[] = []

  for (const group of groups) {
    const h = groupHeight(group.cards.length)

    // Try to fit into an existing column (shortest first) without exceeding tallest
    let bestIdx = -1
    let bestHeight = Infinity

    for (let i = 0; i < columns.length; i++) {
      const newHeight = columns[i].height + GROUP_GAP + h
      if (newHeight <= tallest + GROUP_GAP && columns[i].height < bestHeight) {
        bestHeight = columns[i].height
        bestIdx = i
      }
    }

    if (bestIdx >= 0 && columns.length >= maxColumns) {
      // Only pack into existing column when we've hit the column limit
      columns[bestIdx].groups.push(group)
      columns[bestIdx].height += GROUP_GAP + h
    } else if (columns.length < maxColumns) {
      // Still have room for a new column
      columns.push({ groups: [group], height: h })
    } else {
      // No room for new column and nothing fits — pack into shortest column anyway
      let shortestIdx = 0
      for (let i = 1; i < columns.length; i++) {
        if (columns[i].height < columns[shortestIdx].height) shortestIdx = i
      }
      columns[shortestIdx].groups.push(group)
      columns[shortestIdx].height += GROUP_GAP + h
    }
  }

  return columns.map((c) => c.groups)
}

export function commanderToSlug(name: string): string {
  return name.toLowerCase().replace(/[',]/g, '').replace(/\s+/g, '-')
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
