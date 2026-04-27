/**
 * Shared constants for API routes
 */

export const USER_AGENT = process.env.VITE_USER_AGENT || "MTGDeckBuilder/1.0";

/**
 * Cache TTL values (in milliseconds)
 */
export const CACHE_TTL = {
  EDHREC: parseInt(process.env.CACHE_TTL_EDHREC || "86400000", 10), // 24 hours
  TOURNAMENT: parseInt(process.env.CACHE_TTL_TOURNAMENT || "21600000", 10), // 6 hours
};

/**
 * External API timeouts (in milliseconds)
 */
export const API_TIMEOUT = 10000; // 10 seconds

/**
 * Scryfall batch size for card collection endpoint
 */
export const SCRYFALL_BATCH_SIZE = 75;
