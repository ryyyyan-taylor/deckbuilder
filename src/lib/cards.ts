import type { Game } from './games'
import { getSwuCardType, SWU_TYPE_ORDER } from './swu'

export const MTG_TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Sorcery', 'Instant', 'Enchantment', 'Artifact', 'Land', 'Other'] as const
export const TYPE_ORDER = MTG_TYPE_ORDER // backwards-compat export

export function getTypeOrder(game: Game = 'mtg'): readonly string[] {
  return game === 'swu' ? SWU_TYPE_ORDER : MTG_TYPE_ORDER
}

/** Build a Scryfall art_crop CDN URL from a scryfall_id */
export function scryfallArtCropUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/art_crop/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}

/** Build a SWUAPI image URL from card data */
export function swudbImageUrl(imageUris: Record<string, string> | null | undefined): string {
  return imageUris?.normal ?? ''
}

/** Returns the back-face image URL for DFCs (MTG) and Leaders (SWU), null if single-faced */
export function cardBackFaceUrl(card: { name?: string | null; type_line?: string | null; scryfall_id?: string; image_uris?: Record<string, string> | null }): string | null {
  if (card.image_uris?.back) return card.image_uris.back
  const isDfc = card.name?.includes(' // ') || card.type_line?.includes(' // ')
  if (!isDfc || !card.scryfall_id) return null
  const id = card.scryfall_id
  return `https://cards.scryfall.io/normal/back/${id[0]}/${id[1]}/${id}.jpg`
}

/** Get the appropriate image URL for a card based on game and size */
export function cardImageUrl(
  card: { image_uris?: Record<string, string> | null },
  game: Game,
  size: 'normal' | 'art_crop' = 'normal'
): string {
  if (game === 'swu') {
    return swudbImageUrl(card.image_uris)
  }
  return card.image_uris?.[size] ?? ''
}

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
 * otherwise each group gets its own column in typeOrder.
 *
 * When packing is needed, first tries priority merges (Artifact+Enchantment,
 * then Instant+Sorcery) — but only if the merged height ≤ the current tallest
 * column (i.e. it saves height). Falls back to bin-packing for any remainder.
 */
export function packColumns<T extends TypeGroup>(
  groups: T[],
  maxColumns: number,
  typeOrder: readonly string[] = MTG_TYPE_ORDER
): T[][] {
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

    // Merge, preserving typeOrder within the combined column
    const merged = [...columns[idxA], ...columns[idxB]].sort(
      (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
    ) as T[]
    const removeIdx = idxA < idxB ? idxB : idxA
    const keepIdx = idxA < idxB ? idxA : idxB
    columns[keepIdx] = merged
    columns.splice(removeIdx, 1)
  }

  // If still over maxColumns, fall back to bin-packing.
  // Use First Fit Decreasing (tallest groups first) so tall anchors like Creature
  // and Land claim their own columns before shorter groups fill the remainder.
  if (columns.length > maxColumns) {
    const allGroups = [...columns.flat() as T[]].sort(
      (a, b) => groupHeight(b.cards.length) - groupHeight(a.cards.length)
    )
    const tallest = groupHeight(allGroups[0].cards.length)
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

    // Restore typeOrder within each column and sort columns left-to-right
    // by the typeOrder position of their leading group.
    columns = columns
      .map((col) => [...col].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)) as T[])
      .sort((a, b) => typeOrder.indexOf(a[0].type) - typeOrder.indexOf(b[0].type))
  }

  return columns
}

export function commanderToSlug(name: string): string {
  return name.toLowerCase().replace(/[',]/g, '').replace(/\s+/g, '-')
}

interface CardForType {
  type_line?: string | null
  swu_type?: string | null
  arena?: string | null
}

export function getCardType(card: CardForType, game: Game = 'mtg'): string {
  if (game === 'swu') {
    return getSwuCardType(card)
  }
  return getMtgCardType(card.type_line ?? null)
}

function getMtgCardType(typeLine: string | null): string {
  if (!typeLine) return 'Other'
  // For DFCs, only classify by the front face (before ' // ')
  const front = typeLine.split(' // ')[0]
  const main = front.split(' — ')[0]
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

/** True for MDFCs whose back face is a land but front face is not (e.g. Bala Ged Recovery // Bala Ged Sanctuary) */
export function isMdfcLandBack(typeLine: string | null): boolean {
  if (!typeLine || !typeLine.includes(' // ')) return false
  const [front, back] = typeLine.split(' // ')
  return !front.split(' — ')[0].includes('Land') && back.split(' — ')[0].includes('Land')
}
