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

// Priority merge pairs: try these in order when columns overflow, only if it saves height
const MERGE_PRIORITIES: [string, string][] = [
  ['Artifact', 'Enchantment'],
  ['Instant', 'Sorcery'],
]

function colHeight(col: TypeGroup[]): number {
  return col.reduce((h, g, i) => h + (i > 0 ? GROUP_GAP : 0) + groupHeight(g.cards.length), 0)
}

/**
 * Pack type groups into columns to fit within maxColumns.
 * Only packs when the number of groups exceeds maxColumns;
 * otherwise each group gets its own column in TYPE_ORDER.
 *
 * When packing is needed, first tries priority merges (Artifact+Enchantment,
 * then Instant+Sorcery) — but only if the merged height ≤ the current tallest
 * column (i.e. it saves height). Falls back to bin-packing for any remainder.
 */
export function packColumns<T extends TypeGroup>(groups: T[], maxColumns: number): T[][] {
  if (groups.length === 0) return []

  // No packing needed — everything fits
  if (groups.length <= maxColumns) {
    return groups.map((g) => [g])
  }

  // Start with each group in its own column
  let columns: T[][] = groups.map((g) => [g])

  const height = (col: T[]) => colHeight(col as TypeGroup[])

  // Try priority merges first, only when the combined height doesn't exceed the current max
  for (const [typeA, typeB] of MERGE_PRIORITIES) {
    if (columns.length <= maxColumns) break

    const idxA = columns.findIndex((col) => col.some((g) => g.type === typeA))
    const idxB = columns.findIndex((col) => col.some((g) => g.type === typeB))
    if (idxA === -1 || idxB === -1) continue

    const maxHeight = Math.max(...columns.map(height))
    const mergedHeight = height(columns[idxA]) + GROUP_GAP + height(columns[idxB])
    if (mergedHeight > maxHeight) continue // would increase height — skip

    // Merge, preserving TYPE_ORDER within the combined column
    const merged = [...columns[idxA], ...columns[idxB]].sort(
      (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
    ) as T[]
    const removeIdx = idxA < idxB ? idxB : idxA
    const keepIdx = idxA < idxB ? idxA : idxB
    columns[keepIdx] = merged
    columns.splice(removeIdx, 1)
  }

  // If still over maxColumns, fall back to bin-packing (shortest column first)
  if (columns.length > maxColumns) {
    const allGroups = columns.flat() as T[]
    const tallest = Math.max(...allGroups.map((g) => groupHeight(g.cards.length)))
    columns = []

    for (const group of allGroups) {
      const h = groupHeight(group.cards.length)
      let bestIdx = -1
      let bestHeight = Infinity

      for (let i = 0; i < columns.length; i++) {
        const newHeight = height(columns[i]) + GROUP_GAP + h
        if (newHeight <= tallest + GROUP_GAP && height(columns[i]) < bestHeight) {
          bestHeight = height(columns[i])
          bestIdx = i
        }
      }

      if (bestIdx >= 0 && columns.length >= maxColumns) {
        columns[bestIdx] = [...columns[bestIdx], group]
      } else if (columns.length < maxColumns) {
        columns.push([group])
      } else {
        let shortestIdx = 0
        for (let i = 1; i < columns.length; i++) {
          if (height(columns[i]) < height(columns[shortestIdx])) shortestIdx = i
        }
        columns[shortestIdx] = [...columns[shortestIdx], group]
      }
    }
  }

  return columns
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
