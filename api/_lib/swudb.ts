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
  type_line: string
  image_uris: Record<string, string>
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
    const data = await res.json() as { cards: SwuapiCard[] }
    return data.cards ?? []
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
