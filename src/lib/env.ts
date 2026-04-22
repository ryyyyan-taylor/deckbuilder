/**
 * Environment variable validation utilities for server-side code.
 * All env vars are validated at startup; missing vars throw clear errors.
 */

function getEnv(key: string, required = true): string {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export const env = {
  // Supabase config — required for all API routes
  SUPABASE_URL: getEnv('VITE_SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: getEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // Optional config
  FRONTEND_URL: getEnv('FRONTEND_URL', false) || 'http://localhost:5173',
  NODE_ENV: getEnv('NODE_ENV', false) || 'development',
};

// Validate at startup (called once per Lambda)
export function validateEnv() {
  const required = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
