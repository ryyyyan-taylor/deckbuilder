/**
 * Simple in-memory rate limiting for API routes.
 * Note: This is per-Lambda instance (stateless). For distributed rate limiting,
 * use Redis (Upstash) or Vercel's built-in rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Check if request exceeds rate limit
 * @param key - Unique identifier (IP, user ID, etc.)
 * @param limit - Max requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns true if within limit, false if exceeded
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetTime) {
    // New window or expired
    store.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count < limit) {
    entry.count++;
    return true;
  }

  return false;
}

/**
 * Get remaining quota for rate limit key
 * @param key - Unique identifier
 * @param limit - Max requests allowed
 * @returns Remaining requests in current window
 */
export function getRateLimitRemaining(key: string, limit: number): number {
  const entry = store.get(key);
  if (!entry || Date.now() >= entry.resetTime) {
    return limit;
  }
  return Math.max(0, limit - entry.count);
}

/**
 * Get reset time for rate limit key
 * @param key - Unique identifier
 * @returns Unix timestamp when limit resets
 */
export function getRateLimitReset(key: string): number {
  const entry = store.get(key);
  return entry?.resetTime || Date.now();
}

/**
 * Clear expired entries (cleanup)
 * Call periodically to prevent memory leak
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetTime) {
      store.delete(key);
    }
  }
}

// Cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 10 * 60 * 1000);
}

/**
 * Standard rate limits for different endpoint types
 */
export const RATE_LIMITS = {
  // Expensive external API calls
  IMPORT_MOXFIELD: { limit: 20, window: 60 * 1000 }, // 20 per minute
  IMPORT_SWUDB: { limit: 20, window: 60 * 1000 }, // 20 per minute
  SUGGESTIONS_EDHREC: { limit: 30, window: 60 * 1000 }, // 30 per minute
  RESULTS_TOURNAMENT: { limit: 30, window: 60 * 1000 }, // 30 per minute

  // Card search (lighter weight)
  CARDS_SEARCH: { limit: 60, window: 60 * 1000 }, // 60 per minute
  CARDS_SINGLE: { limit: 100, window: 60 * 1000 }, // 100 per minute
};
