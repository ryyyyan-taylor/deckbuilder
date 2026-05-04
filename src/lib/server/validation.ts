/**
 * Input validation utilities for API routes.
 * All user inputs validated before processing to prevent injection/DoS.
 */

export interface ValidationError {
  message: string;
  code: string;
  name: string;
}

export function createValidationError(message: string, code = 'VALIDATION_ERROR'): ValidationError {
  return { message, code, name: 'ValidationError' };
}

/**
 * Validate a required string parameter
 * @param value - The value to validate
 * @param maxLength - Maximum allowed length (default 255)
 * @param pattern - Optional regex pattern for format validation
 * @throws ValidationError if invalid
 */
export function validateString(
  value: unknown,
  maxLength = 255,
  pattern?: RegExp
): string {
  if (!value || typeof value !== 'string') {
    throw createValidationError('Value must be a non-empty string');
  }
  if (value.length > maxLength) {
    throw createValidationError(`String exceeds maximum length of ${maxLength}`);
  }
  if (pattern && !pattern.test(value)) {
    throw createValidationError(`String does not match required format`);
  }
  return value.trim();
}

/**
 * Validate a Moxfield deck URL
 * @param url - The Moxfield URL to validate
 * @returns Extracted deck ID
 * @throws ValidationError if invalid
 */
export function validateMoxfieldUrl(url: unknown): string {
  if (!url || typeof url !== 'string') {
    throw createValidationError('URL must be a non-empty string');
  }

  const trimmed = url.trim();
  if (trimmed.length > 500) {
    throw createValidationError('URL exceeds maximum length');
  }

  // Strict Moxfield URL format: https://www.moxfield.com/decks/{deckId}
  const match = trimmed.match(
    /^https?:\/\/(www\.)?moxfield\.com\/decks\/([a-zA-Z0-9_-]+)$/i
  );
  if (!match) {
    throw createValidationError(
      'Invalid Moxfield URL. Expected format: https://www.moxfield.com/decks/{deckId}'
    );
  }

  const deckId = match[2];
  if (deckId.length > 50) {
    throw createValidationError('Deck ID is invalid');
  }

  return deckId;
}

/**
 * Validate a commander name
 * @param name - The commander name to validate
 * @returns Validated name
 * @throws ValidationError if invalid
 */
export function validateCommanderName(name: unknown): string {
  const validated = validateString(name, 100);
  // Allow letters, spaces, hyphens, apostrophes, commas, slashes (for partner commanders)
  if (!/^[a-zA-Z\s,\-'()/]+$/.test(validated)) {
    throw createValidationError(
      'Commander name contains invalid characters. Only letters, spaces, hyphens, commas, apostrophes, and slashes allowed.'
    );
  }
  return validated;
}

/**
 * Validate a query string (for card search)
 * @param query - The search query to validate
 * @returns Validated query
 * @throws ValidationError if invalid
 */
export function validateQuery(query: unknown): string {
  const validated = validateString(query, 100);
  if (validated.length < 2) {
    throw createValidationError('Query must be at least 2 characters');
  }
  return validated;
}

/**
 * Validate an enum value against allowed list
 * @param value - The value to validate
 * @param allowedValues - List of allowed values
 * @returns Validated value
 * @throws ValidationError if not in allowed list
 */
export function validateEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): T {
  if (!value || typeof value !== 'string') {
    throw createValidationError('Value must be a non-empty string');
  }
  if (!allowedValues.includes(value as T)) {
    throw createValidationError(
      `Invalid value. Must be one of: ${allowedValues.join(', ')}`
    );
  }
  return value as T;
}

/**
 * Validate card names from external sources (sanitize for DB queries)
 * @param names - Array of card names to validate
 * @returns Filtered array of valid names
 */
export function validateCardNames(names: unknown[]): string[] {
  if (!Array.isArray(names)) {
    throw createValidationError('Card names must be an array');
  }

  return names
    .filter((n) => typeof n === 'string' && n.length > 0)
    .map((n) => (n as string).trim())
    .filter((n) => {
      // Allow letters, spaces, hyphens, commas, apostrophes, forward slashes, parentheses
      return /^[a-zA-Z\s,\-'()/]+$/.test(n) && n.length <= 255;
    });
}

export function validateGame(input: unknown): 'mtg' | 'swu' {
  if (input === 'swu') return 'swu';
  return 'mtg'; // default to MTG
}

/**
 * Validate a SWUDB deck URL
 * @param url - The SWUDB URL to validate
 * @returns Extracted deck ID
 * @throws ValidationError if invalid
 */
export function validateSwudbUrl(url: unknown): string {
  if (!url || typeof url !== 'string') {
    throw createValidationError('URL must be a non-empty string');
  }

  const trimmed = url.trim();
  if (trimmed.length > 500) {
    throw createValidationError('URL exceeds maximum length');
  }

  // SWUDB URL format: https://swudb.com/deck/{deckId} or https://www.swudb.com/deck/{deckId}
  const match = trimmed.match(
    /^https?:\/\/(www\.)?swudb\.com\/deck\/([a-zA-Z0-9_-]+)$/i
  );
  if (!match) {
    throw createValidationError(
      'Invalid SWUDB URL. Expected format: https://swudb.com/deck/{deckId}'
    );
  }

  const deckId = match[2];
  if (deckId.length > 100) {
    throw createValidationError('Deck ID is invalid');
  }

  return deckId;
}

/**
 * Validate request body size (prevent DoS via oversized payloads)
 * @param body - The request body (as string or Buffer)
 * @param maxBytes - Maximum allowed size in bytes (default 10KB)
 * @throws ValidationError if too large
 */
export function validatePayloadSize(
  body: unknown,
  maxBytes = 10 * 1024
): void {
  let sizeBytes = 0;

  if (typeof body === 'string') {
    sizeBytes = Buffer.byteLength(body, 'utf8');
  } else if (Buffer.isBuffer(body)) {
    sizeBytes = body.length;
  } else if (body !== null && typeof body === 'object') {
    sizeBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
  }

  if (sizeBytes > maxBytes) {
    throw createValidationError(
      `Payload exceeds maximum size of ${maxBytes} bytes (received ${sizeBytes} bytes)`
    );
  }
}

/**
 * Validate POST request body structure (ensure required fields exist and are correct type)
 * @param body - The request body object
 * @param requiredFields - Object defining field names and expected types
 * @throws ValidationError if required fields missing or wrong type
 */
export function validatePostBody(
  body: unknown,
  requiredFields: Record<string, 'string' | 'number' | 'boolean' | 'object'>
): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    throw createValidationError('Request body must be a valid JSON object');
  }

  const bodyObj = body as Record<string, unknown>;

  for (const [field, expectedType] of Object.entries(requiredFields)) {
    const value = bodyObj[field];

    if (value === undefined || value === null) {
      throw createValidationError(`Missing required field: ${field}`);
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType && expectedType !== 'object') {
      throw createValidationError(
        `Field '${field}' must be of type ${expectedType}, got ${actualType}`
      );
    }
  }

  return bodyObj;
}
