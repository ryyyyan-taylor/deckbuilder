/**
 * Runtime type validation schemas using Zod
 * Used to validate API responses and data structures at runtime
 */

// Simple runtime type checking without external dependencies
// This is a lightweight alternative to Zod that works with our constraints

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Card schema for runtime validation
 */
export interface CardData {
  id: string;
  scryfall_id: string;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[];
  color_identity: string[];
  set_code: string | null;
  oracle_text?: string | null;
  image_uris: {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop?: string;
  } | null;
}

export function parseCard(data: unknown): ParseResult<CardData> {
  if (!data || typeof data !== "object") {
    return { success: false, error: "Card data must be an object" };
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (!obj.id || typeof obj.id !== "string") {
    return { success: false, error: "Missing or invalid id" };
  }
  if (!obj.scryfall_id || typeof obj.scryfall_id !== "string") {
    return { success: false, error: "Missing or invalid scryfall_id" };
  }
  if (!obj.name || typeof obj.name !== "string") {
    return { success: false, error: "Missing or invalid name" };
  }

  // Validate arrays
  if (!Array.isArray(obj.colors)) {
    return { success: false, error: "colors must be an array" };
  }
  if (!Array.isArray(obj.color_identity)) {
    return { success: false, error: "color_identity must be an array" };
  }

  return {
    success: true,
    data: {
      id: obj.id as string,
      scryfall_id: obj.scryfall_id as string,
      name: obj.name as string,
      mana_cost: (obj.mana_cost as string) || null,
      cmc: (obj.cmc as number) || null,
      type_line: (obj.type_line as string) || null,
      colors: (obj.colors as string[]) || [],
      color_identity: (obj.color_identity as string[]) || [],
      set_code: (obj.set_code as string) || null,
      oracle_text: (obj.oracle_text as string) || null,
      image_uris: obj.image_uris ? validateImageUris(obj.image_uris) : null,
    },
  };
}

function validateImageUris(data: unknown): CardData["image_uris"] {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  if (!obj.small || !obj.normal || !obj.large || !obj.png) {
    return null;
  }

  return {
    small: obj.small as string,
    normal: obj.normal as string,
    large: obj.large as string,
    png: obj.png as string,
    art_crop: (obj.art_crop as string) || undefined,
  };
}

/**
 * Deck schema for runtime validation
 */
export interface DeckData {
  id: string;
  user_id: string;
  name: string;
  format: string | null;
  description: string | null;
  is_public: boolean;
  sections: string[];
  created_at: string;
  updated_at: string;
  display_card_id: string | null;
}

export function parseDeck(data: unknown): ParseResult<DeckData> {
  if (!data || typeof data !== "object") {
    return { success: false, error: "Deck data must be an object" };
  }

  const obj = data as Record<string, unknown>;

  if (!obj.id || typeof obj.id !== "string") {
    return { success: false, error: "Missing or invalid id" };
  }
  if (!obj.user_id || typeof obj.user_id !== "string") {
    return { success: false, error: "Missing or invalid user_id" };
  }
  if (!obj.name || typeof obj.name !== "string") {
    return { success: false, error: "Missing or invalid name" };
  }

  return {
    success: true,
    data: {
      id: obj.id as string,
      user_id: obj.user_id as string,
      name: obj.name as string,
      format: (obj.format as string) || null,
      description: (obj.description as string) || null,
      is_public: Boolean(obj.is_public),
      sections: Array.isArray(obj.sections) ? (obj.sections as string[]) : [],
      created_at: (obj.created_at as string) || "",
      updated_at: (obj.updated_at as string) || "",
      display_card_id: (obj.display_card_id as string) || null,
    },
  };
}

/**
 * Import result schema
 */
export interface ImportResultData {
  name: string;
  cards: Array<{
    card_id: string;
    section: string;
    quantity: number;
  }>;
  sections: string[];
}

export function parseImportResult(data: unknown): ParseResult<ImportResultData> {
  if (!data || typeof data !== "object") {
    return { success: false, error: "Import result must be an object" };
  }

  const obj = data as Record<string, unknown>;

  if (!obj.name || typeof obj.name !== "string") {
    return { success: false, error: "Missing or invalid name" };
  }
  if (!Array.isArray(obj.cards)) {
    return { success: false, error: "cards must be an array" };
  }
  if (!Array.isArray(obj.sections)) {
    return { success: false, error: "sections must be an array" };
  }

  return {
    success: true,
    data: {
      name: obj.name as string,
      cards: (obj.cards as Array<{
        card_id: string;
        section: string;
        quantity: number;
      }>) || [],
      sections: (obj.sections as string[]) || [],
    },
  };
}

/**
 * Suggestions schema
 */
export interface SuggestionsData {
  categories: Array<{
    name: string;
    cards: Array<{
      card_id: string | null;
      name: string;
      inclusion: number;
      synergy: number;
      num_decks: number;
      image_uri: string | null;
    }>;
  }>;
}

export function parseSuggestions(data: unknown): ParseResult<SuggestionsData> {
  if (!data || typeof data !== "object") {
    return { success: false, error: "Suggestions data must be an object" };
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.categories)) {
    return { success: false, error: "categories must be an array" };
  }

  return {
    success: true,
    data: {
      categories: (obj.categories as Array<{
        name: string;
        cards: Array<{
          card_id: string | null;
          name: string;
          inclusion: number;
          synergy: number;
          num_decks: number;
          image_uri: string | null;
        }>;
      }>) || [],
    },
  };
}
