/**
 * Structured logging utility for consistent application logging
 */

export interface LogContext {
  [key: string]: unknown;
}

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * Format and log a message with context
 */
function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context && Object.keys(context).length > 0
    ? ` ${JSON.stringify(context)}`
    : "";
  return `[${timestamp}] [${level}] ${message}${contextStr}`;
}

/**
 * Logger instance with methods for different log levels
 */
export const logger = {
  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(formatLog(LogLevel.DEBUG, message, context));
    }
  },

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    console.log(formatLog(LogLevel.INFO, message, context));
  },

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    console.warn(formatLog(LogLevel.WARN, message, context));
  },

  /**
   * Log error message
   */
  error(message: string, context?: LogContext): void {
    console.error(formatLog(LogLevel.ERROR, message, context));
  },
};

/**
 * Log API request
 */
export function logApiRequest(
  route: string,
  method: string,
  statusCode: number,
  duration?: number
): void {
  logger.info("API request", {
    route,
    method,
    statusCode,
    durationMs: duration,
  });
}

/**
 * Log API error
 */
export function logApiError(
  route: string,
  error: string,
  statusCode?: number,
  context?: LogContext
): void {
  logger.error("API error", {
    route,
    error,
    statusCode,
    ...context,
  });
}

/**
 * Log user action (deck created, card added, etc.)
 */
export function logUserAction(
  action: string,
  userId?: string,
  details?: LogContext
): void {
  logger.info("User action", {
    action,
    userId,
    ...details,
  });
}
