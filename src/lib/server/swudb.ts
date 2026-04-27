// SWUDB API client — uses swuapi.com (Lukas Litzsinger's SWU database)
// Verified: 2026-04-24
// - Base URL: https://www.swuapi.com
// - Bulk endpoint: GET /export/all (returns all cards + sets as single JSON payload)
// - Single card: GET /cards/{id} or GET /cards?name=...
// - Search: GET /cards?name=... (partial match), supports limit/offset pagination
// - Deck endpoint: Not available via API (would need web scrape)
// - User-Agent: Not required
// - Rate limit: None documented; implement courtesy 1-per-second internally
// - Card data includes: uuid, name, subtitle, type (Leader/Base/Unit/Event/Upgrade),
//   aspects[], arena (Ground/Space or null), cost, hp, power, front_image_url, back_image_url,
//   is_leader, is_base flags, set_code, collector_number, keywords, traits, artist

const SWUAPI_BASE = 'https://www.swuapi.com'
const FETCH_TIMEOUT = 10000 // 10 seconds

export interface SwuapiCard {
  uuid: string
  collector_number: string
  name: string
  subtitle: string | null
  type: string // 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade'
  aspects: string[] // e.g. ['Vigilance', 'Command']
  arena: string | null // 'Ground' | 'Space' or null
  cost: number | null
  power: number | null
  hp: number | null
  front_image_url: string
  back_image_url: string | null
  set_code: string
  card_number: string
  keywords: string[]
  traits: string[]
  artist: string
  rarity: string
  is_leader: boolean
  is_base: boolean
  variant_type: string
  epic_action: string | null
  created_at: string
  updated_at: string
  external_id: number
  external_uid: string
}

export interface SwuapiResponse {
  cards: SwuapiCard[]
  page?: number
  limit?: number
  total?: number
}

export interface SwudbCard {
  scryfall_id: string // uuid from API
  name: string
  swu_type: string // 'Leader', 'Base', 'Unit', 'Event', 'Upgrade'
  aspects: string[]
  arena: string | null
  cost: number | null
  hp: number | null
  power: number | null
  set_code: string
  image_uris: Record<string, string> | null
  type_line: string
}

export function swudbToRow(card: SwuapiCard): DbCardInsert {
  return {
    game: 'swu',
    scryfall_id: card.uuid, // use UUID as external_id
    name: card.subtitle ? `${card.name}, ${card.subtitle}` : card.name,
    swu_type: card.type,
    aspects: card.aspects ?? [],
    cost: card.cost ?? null,
    arena: card.arena ?? null,
    hp: card.hp ?? null,
    power: card.power ?? null,
    set_code: card.set_code,
    card_number: card.card_number || null,
    type_line: card.type, // keep type_line populated for generic code paths
    image_uris: {
      normal: card.front_image_url,
      ...(card.back_image_url ? { back: card.back_image_url } : {}),
    },
    // Leave MTG columns null
  }
}

interface DbCardInsert {
  game: 'swu'
  scryfall_id: string
  name: string
  swu_type: string
  aspects: string[]
  cost: number | null
  arena: string | null
  hp: number | null
  power: number | null
  set_code: string
  card_number: string | null
  type_line: string
  image_uris: Record<string, string>
}

// The /export/all endpoint returns camelCase keys; normalize to SwuapiCard (snake_case).
function normalizeBulkCard(c: Record<string, unknown>): SwuapiCard {
  return {
    uuid: c.uuid as string,
    collector_number: (c.id ?? c.collector_number ?? '') as string,
    name: c.name as string,
    subtitle: (c.subtitle ?? null) as string | null,
    type: c.type as string,
    aspects: (c.aspects ?? []) as string[],
    arena: (c.arena ?? null) as string | null,
    cost: (c.cost ?? null) as number | null,
    power: (c.power ?? null) as number | null,
    hp: (c.hp ?? null) as number | null,
    front_image_url: (c.frontImageUrl ?? c.front_image_url ?? '') as string,
    back_image_url: (c.backImageUrl ?? c.back_image_url ?? null) as string | null,
    set_code: (c.setCode ?? c.set_code ?? '') as string,
    card_number: (c.cardNumber ?? c.card_number ?? '') as string,
    keywords: (c.keywords ?? []) as string[],
    traits: (c.traits ?? []) as string[],
    artist: (c.artist ?? '') as string,
    rarity: (c.rarity ?? '') as string,
    is_leader: (c.isLeader ?? c.is_leader ?? false) as boolean,
    is_base: (c.isBase ?? c.is_base ?? false) as boolean,
    variant_type: (c.variantType ?? c.variant_type ?? '') as string,
    epic_action: (c.epicAction ?? c.epic_action ?? null) as string | null,
    created_at: (c.created_at ?? '') as string,
    updated_at: (c.updated_at ?? '') as string,
    external_id: (c.externalId ?? c.external_id ?? 0) as number,
    external_uid: (c.externalUid ?? c.external_uid ?? '') as string,
  }
}

export async function fetchSwuapiBulk(): Promise<SwuapiCard[]> {
  const url = `${SWUAPI_BASE}/export/all`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`SWUAPI bulk fetch failed: ${res.status}`)
    const data = await res.json() as { cards: Record<string, unknown>[] }
    return (data.cards ?? []).map(normalizeBulkCard)
  } finally {
    clearTimeout(timeout)
  }
}

export async function searchSwuapiCards(query: string, limit = 500): Promise<SwuapiCard[]> {
  const url = new URL(`${SWUAPI_BASE}/cards`)
  url.searchParams.set('name', query)
  url.searchParams.set('limit', limit.toString())

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`SWUAPI search failed: ${res.status}`)
    const data = await res.json() as SwuapiResponse
    return data.cards ?? []
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchSwuapiCardById(uuid: string): Promise<SwuapiCard | null> {
  const url = `${SWUAPI_BASE}/cards/${uuid}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`SWUAPI card fetch failed: ${res.status}`)
    return await res.json() as SwuapiCard
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchSwuapiCardsByName(names: string[]): Promise<SwuapiCard[]> {
  // Fetch each name individually (no batch endpoint)
  const results: SwuapiCard[] = []
  for (const name of names) {
    try {
      const cards = await searchSwuapiCards(name, 1)
      if (cards.length > 0) results.push(cards[0])
    } catch {
      // Silently skip on error
    }
  }
  return results
}

// SWUDB deck API response types (swudb.com/api/deck/{id})
interface SwudbApiCardRef {
  cardId: number
  cardName: string
  title: string | null
  type: number   // 0=Leader, 1=Base, 2=Unit, 4=Event, 5=Upgrade
  arena: number | null  // 0=Ground, 1=Space, null=N/A
}

interface SwudbApiDeckItem {
  count: number
  sideboardCount: number
  card: SwudbApiCardRef
}

interface SwudbApiResponse {
  deckId: string
  deckName: string
  deckFormat: number
  leader: SwudbApiCardRef | null
  secondLeader: SwudbApiCardRef | null
  base: SwudbApiCardRef | null
  shuffledDeck: SwudbApiDeckItem[]
}

export interface SwudbDeckCard {
  name: string          // full card name (cardName + title)
  quantity: number      // mainboard count
  sideboardQuantity: number
  type: number          // SWUDB card type int
  arena: number | null  // SWUDB arena int
}

export interface SwudbDeckExport {
  name: string
  cards: SwudbDeckCard[]
}

function fullCardName(cardName: string, title: string | null): string {
  return title ? `${cardName}, ${title}` : cardName
}

export async function fetchSwudbDeck(deckId: string): Promise<SwudbDeckExport | null> {
  const url = `https://swudb.com/api/deck/${deckId}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) {
      console.warn(`[SWUDB] deck fetch failed for ${deckId}: ${res.status}`)
      return null
    }

    const data = await res.json() as SwudbApiResponse
    const cards: SwudbDeckCard[] = []

    if (data.leader) {
      cards.push({ name: fullCardName(data.leader.cardName, data.leader.title), quantity: 1, sideboardQuantity: 0, type: 0, arena: data.leader.arena ?? null })
    }
    if (data.secondLeader) {
      cards.push({ name: fullCardName(data.secondLeader.cardName, data.secondLeader.title), quantity: 1, sideboardQuantity: 0, type: 0, arena: data.secondLeader.arena ?? null })
    }
    if (data.base) {
      cards.push({ name: fullCardName(data.base.cardName, data.base.title), quantity: 1, sideboardQuantity: 0, type: 1, arena: null })
    }

    for (const item of data.shuffledDeck ?? []) {
      if (item.count > 0 || item.sideboardCount > 0) {
        cards.push({
          name: fullCardName(item.card.cardName, item.card.title),
          quantity: item.count,
          sideboardQuantity: item.sideboardCount,
          type: item.card.type,
          arena: item.card.arena ?? null,
        })
      }
    }

    return { name: data.deckName || 'Untitled Deck', cards }
  } catch (err) {
    console.warn(`[SWUDB] deck fetch error for ${deckId}:`, err instanceof Error ? err.message : 'unknown')
    return null
  } finally {
    clearTimeout(timeout)
  }
}
