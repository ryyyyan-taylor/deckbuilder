/**
 * CORS and security header utilities for API routes
 */

import type { VercelResponse } from "@vercel/node";

/**
 * Add CORS headers to response
 * @param res - Vercel response object
 * @param origin - Allowed origin (defaults to frontend URL)
 */
export function setCorsHeaders(
  res: VercelResponse,
  origin?: string
): void {
  const allowedOrigin = origin || process.env.FRONTEND_URL || "http://localhost:5173";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
}

/**
 * Handle preflight CORS requests
 * @param res - Vercel response object
 * @returns true if this was a preflight request that was handled
 */
export function handleCorsPreFlight(res: VercelResponse): boolean {
  setCorsHeaders(res);
  res.status(200).end();
  return true;
}

/**
 * Check if request origin is allowed
 * @param requestOrigin - Origin from request headers
 * @param allowedOrigin - Expected origin (defaults to FRONTEND_URL)
 * @param requestHost - Host header from the request (used for same-origin fallback)
 * @returns true if origin is allowed
 */
export function isOriginAllowed(
  requestOrigin: string | undefined,
  allowedOrigin?: string,
  requestHost?: string
): boolean {
  if (!requestOrigin) return false;

  // Allow localhost in development
  if (requestOrigin.includes("localhost")) {
    return true;
  }

  const expected = allowedOrigin || process.env.FRONTEND_URL;

  if (expected) {
    return requestOrigin === expected;
  }

  // Fallback: allow same-origin requests (origin hostname matches request host)
  if (requestHost) {
    try {
      const originHost = new URL(requestOrigin).hostname;
      return originHost === requestHost.split(":")[0];
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Verify request origin for protected endpoints
 * @param requestOrigin - Origin from request headers
 * @param allowedOrigin - Expected origin (defaults to FRONTEND_URL)
 * @param requestHost - Host header from the request (used for same-origin fallback)
 * @throws Error if origin is not allowed
 */
export function verifyOrigin(
  requestOrigin: string | undefined,
  allowedOrigin?: string,
  requestHost?: string
): void {
  if (!isOriginAllowed(requestOrigin, allowedOrigin, requestHost)) {
    throw new Error(`Forbidden: Invalid origin "${requestOrigin}"`);
  }
}
