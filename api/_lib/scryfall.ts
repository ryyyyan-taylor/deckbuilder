// Scryfall API client helpers — used by card search/fetch endpoints and Moxfield importer

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  colors?: string[];
  color_identity?: string[];
  set: string;
  released_at?: string;
  image_uris?: Record<string, string>;
  card_faces?: Array<{ image_uris?: Record<string, string> }>;
}

interface ScryfallRow {
  game: 'mtg';
  scryfall_id: string;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[];
  color_identity: string[];
  set_code: string;
  released_at: string | null;
  image_uris: Record<string, string> | null;
}

function pickImageUris(card: ScryfallCard) {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  if (!uris) return null;
  return {
    small: uris.small,
    normal: uris.normal,
    large: uris.large,
    png: uris.png,
  };
}

export function scryfallToRow(card: ScryfallCard): ScryfallRow {
  return {
    game: 'mtg',
    scryfall_id: card.id,
    name: card.name,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc ?? null,
    type_line: card.type_line ?? null,
    colors: card.colors ?? [],
    color_identity: card.color_identity ?? [],
    set_code: card.set,
    released_at: card.released_at ?? null,
    image_uris: pickImageUris(card),
  };
}

export async function searchScryfall(query: string): Promise<ScryfallCard[]> {
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error("[API] scryfall search failed", { query, status: res.status });
      return [];
    }
    const data = await res.json() as { data?: ScryfallCard[] };
    return data.data ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchScryfallById(id: string): Promise<ScryfallCard | null> {
  const url = `https://api.scryfall.com/cards/${id}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("[API] scryfall fetch failed", { id, status: res.status });
      return null;
    }
    return await res.json() as ScryfallCard;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchScryfallByName(name: string, exact = false): Promise<ScryfallCard | null> {
  const url = `https://api.scryfall.com/cards/named?${exact ? 'exact' : 'fuzzy'}=${encodeURIComponent(name)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("[API] scryfall named fetch failed", { name, status: res.status });
      return null;
    }
    return await res.json() as ScryfallCard;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchScryfallCollection(ids: string[]): Promise<ScryfallCard[]> {
  // Batch fetch up to 75 cards at a time
  const results: ScryfallCard[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const batch = ids.slice(i, i + 75);
    const body = { identifiers: batch.map((id) => ({ id })) };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error("[API] scryfall collection fetch failed", { batch: batch.length, status: res.status });
        continue;
      }

      const data = await res.json() as { data?: ScryfallCard[] };
      results.push(...(data.data ?? []));
    } finally {
      clearTimeout(timeout);
    }
  }
  return results;
}
