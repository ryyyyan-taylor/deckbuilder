/**
 * Input validation utilities for API routes.
 * All user inputs validated before processing to prevent injection/DoS.
 */

export class ValidationError extends Error {
  constructor(message: string, public code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
  }
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
    throw new ValidationError('Value must be a non-empty string');
  }
  if (value.length > maxLength) {
    throw new ValidationError(`String exceeds maximum length of ${maxLength}`);
  }
  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`String does not match required format`);
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
    throw new ValidationError('URL must be a non-empty string');
  }

  const trimmed = url.trim();
  if (trimmed.length > 500) {
    throw new ValidationError('URL exceeds maximum length');
  }

  // Strict Moxfield URL format: https://www.moxfield.com/decks/{deckId}
  const match = trimmed.match(
    /^https?:\/\/(www\.)?moxfield\.com\/decks\/([a-zA-Z0-9_-]+)$/i
  );
  if (!match) {
    throw new ValidationError(
      'Invalid Moxfield URL. Expected format: https://www.moxfield.com/decks/{deckId}'
    );
  }

  const deckId = match[2];
  if (deckId.length > 50) {
    throw new ValidationError('Deck ID is invalid');
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
  if (!/^[a-zA-Z\s\-,\'\/]+$/.test(validated)) {
    throw new ValidationError(
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
    throw new ValidationError('Query must be at least 2 characters');
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
    throw new ValidationError('Value must be a non-empty string');
  }
  if (!allowedValues.includes(value as T)) {
    throw new ValidationError(
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
    throw new ValidationError('Card names must be an array');
  }

  return names
    .filter((n) => typeof n === 'string' && n.length > 0)
    .map((n) => (n as string).trim())
    .filter((n) => {
      // Allow letters, spaces, hyphens, commas, apostrophes, forward slashes, parentheses
      return /^[a-zA-Z\s\-,\'\/()]+$/.test(n) && n.length <= 255;
    });
}
