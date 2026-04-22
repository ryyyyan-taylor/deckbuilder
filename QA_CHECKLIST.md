# QA & Security Review Checklist

Last Updated: 2026-04-22  
Review Status: In Progress

---

## 🔴 CRITICAL ISSUES (Must fix before production)

### Secrets & Environment Management

- [x] **Remove exposed secrets from version control**
  - File: `.env.local`
  - Issue: Real Supabase API keys and service role keys committed to repo
  - Risk: Complete database compromise if repo leaked
  - Steps:
    - [x] Add `.env.local` to `.gitignore`
    - [x] Create `.env.example` with placeholder values
    - [ ] Rotate all exposed keys in Supabase dashboard (MANUAL - USER ACTION REQUIRED)
    - [ ] Verify no secrets appear in git history (`git log -p --all | grep -i "key\|secret"`)
  - Files updated: `.gitignore`, `.env.example` ✅

- [x] **Fix unsafe non-null environment variable assertions**
  - Files: All API routes ✅
  - Issue: Using `process.env.VARIABLE!` crashes if missing
  - Risk: Server crashes in production
  - Solution: Created `src/lib/env.ts` with proper validation
  - Applied to all API routes:
    - [x] `api/import/moxfield.ts` ✅
    - [x] `api/cards/search.ts` ✅
    - [x] `api/suggestions/edhrec.ts` ✅
    - [x] `api/results/edhtop16.ts` ✅
    - [x] `api/results/mtgtop8.ts` ✅
    - [x] `api/cards/[scryfall_id].ts` ✅

### Authentication & Input Validation

- [x] **Increase password minimum length**
  - File: `src/components/auth/AuthForm.tsx` (line 63)
  - Updated: `minLength={6}` → `minLength={12}` ✅
  - Note: Supabase Auth settings should also enforce this (verify in Supabase dashboard)

- [x] **Add comprehensive input validation to all API routes**
  - Created: `src/lib/validation.ts` with validators ✅
  - Validators implemented:
    - [x] `validateString()` - max length, pattern matching
    - [x] `validateMoxfieldUrl()` - strict URL format
    - [x] `validateCommanderName()` - name validation with allowed chars
    - [x] `validateQuery()` - search query validation
    - [x] `validateEnum()` - enum whitelist validation
    - [x] `validateCardNames()` - sanitize external card names
  - Applied to all API routes:
    - [x] `api/import/moxfield.ts` ✅
    - [x] `api/cards/search.ts` ✅
    - [x] `api/suggestions/edhrec.ts` ✅
    - [x] `api/results/edhtop16.ts` ✅
    - [x] `api/results/mtgtop8.ts` ✅
    - [x] `api/cards/[scryfall_id].ts` ✅

### API Security

- [x] **Implement rate limiting on API endpoints**
  - Created: `src/lib/rateLimit.ts` with in-memory rate limiting ✅
  - Limits configured:
    - [x] Moxfield import: 20 req/min
    - [x] EDHREC suggestions: 30 req/min
    - [x] Tournament results: 30 req/min
    - [x] Card search: 60 req/min
    - [x] Single card: 100 req/min
  - Applied to all endpoints:
    - [x] `POST /api/import/moxfield` ✅
    - [x] `GET /api/suggestions/edhrec` ✅
    - [x] `GET /api/results/edhtop16` ✅
    - [x] `GET /api/results/mtgtop8` ✅
    - [x] `GET /api/cards/search` ✅
    - [x] `GET /api/cards/[scryfall_id]` ✅
  - Note: Includes X-RateLimit-* headers for client visibility

- [x] **Fix error handling & logging**
  - Applied structured logging to all API routes ✅
  - Updated all catch blocks with:
    - [x] Route-specific error context logging
    - [x] Duration tracking for performance
    - [x] Validation error vs system error differentiation
    - [x] No sensitive details exposed in responses
  - Implemented in all routes:
    - [x] `api/import/moxfield.ts` ✅
    - [x] `api/cards/search.ts` ✅
    - [x] `api/suggestions/edhrec.ts` ✅
    - [x] `api/results/edhtop16.ts` ✅
    - [x] `api/results/mtgtop8.ts` ✅
    - [x] `api/cards/[scryfall_id].ts` ✅
  - Also added request timeouts (10 seconds) to all external API calls

---

## 🟠 HIGH PRIORITY ISSUES (Should fix soon)

### CORS & Security Headers

- [x] **Configure CORS headers on API endpoints** ✅
  - Files: All 6 API routes in `api/` directory ✅
  - Created: `api/_lib/cors.ts` with CORS utilities ✅
  - Applied: `setCorsHeaders(res)` to all routes ✅
  - Headers configured:
    - [x] `Access-Control-Allow-Origin` - Frontend domain
    - [x] `Access-Control-Allow-Methods` - GET, POST, OPTIONS
    - [x] `Access-Control-Allow-Headers` - Content-Type, Authorization

- [x] **Add security headers to all responses** ✅
  - File: `vercel.json` - headers section added ✅
  - Headers configured:
    - [x] `X-Content-Type-Options: nosniff` ✅
    - [x] `X-Frame-Options: DENY` ✅
    - [x] `X-XSS-Protection: 1; mode=block` ✅
    - [x] `Strict-Transport-Security: max-age=31536000` ✅
    - [x] `Content-Security-Policy: restrictive defaults` ✅
    - [x] `Referrer-Policy: strict-no-referrer` ✅
    - [x] `Permissions-Policy: disable camera/mic/geolocation` ✅

### API Access Control

- [x] **Add authentication/origin checks to expensive endpoints** ✅
  - Endpoints protected with origin verification:
    - [x] `POST /api/import/moxfield` ✅
    - [x] `GET /api/suggestions/edhrec` ✅
    - [x] `GET /api/results/edhtop16` ✅
    - [x] `GET /api/results/mtgtop8` ✅
  - Implementation: `verifyOrigin(req.headers.origin)` ✅
  - Returns 403 Forbidden for unknown origins ✅
  - Logs failed attempts ✅

- [x] **Set request size limits** ✅
  - Vercel has built-in limits (1MB default for Serverless Functions)
  - No additional configuration needed (defaults are sufficient)

### Type & Query Safety

- [x] **Fix potential SQL injection via card names** ✅
  - Files: `api/suggestions/edhrec.ts`, `api/import/moxfield.ts` ✅
  - Implementation: `validateCardNames()` filters unsafe characters ✅
  - Only allows: letters, spaces, commas, hyphens, apostrophes, slashes, parentheses ✅
  - Max length: 255 characters ✅

- [x] **Add runtime type validation with schemas** ✅
  - Created: `src/lib/schemas.ts` with lightweight validators ✅
  - No external dependencies (Zod-like API) ✅
  - Validators implemented:
    - [x] `parseCard()` - Card data validation
    - [x] `parseDeck()` - Deck data validation
    - [x] `parseImportResult()` - Import API responses
    - [x] `parseSuggestions()` - EDHREC suggestions data
  - Returns `ParseResult<T>` with success/error info ✅

---

## 🟡 MEDIUM PRIORITY ISSUES (Nice to have)

### Observability & Monitoring

- [ ] **Implement structured logging throughout API**
  - Current: Only generic error messages
  - Solution: Use centralized logging (Sentry, LogRocket, or stderr)
  - Include in logs:
    - [ ] Request method, path, status code
    - [ ] Error messages with context
    - [ ] Performance metrics (API call duration)
    - [ ] User action outcomes (deck created, card added, etc.)
  - Create `src/lib/logger.ts` utility

- [ ] **Add error boundary component to frontend**
  - Issue: Unhandled errors can crash entire app
  - File: Create `src/components/ErrorBoundary.tsx`
  - Wrap in: `src/App.tsx`
  - Should catch and display errors gracefully

### Configuration & Documentation

- [ ] **Create `.env.example` file**
  - Current: Only `.env.local` with real values
  - Solution: Create template for developers
  - Include all required vars with descriptions:
    ```
    VITE_SUPABASE_URL=https://your-project.supabase.co
    VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
    SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
    ```

- [ ] **Move hardcoded User-Agent strings to config**
  - Files: Multiple API routes use `"MTGDeckBuilder/1.0"`
  - Solution: Move to environment variable or constant
  - Create `src/lib/constants.ts`:
    ```typescript
    export const USER_AGENT = process.env.VITE_USER_AGENT || 'MTGDeckBuilder/1.0';
    ```

- [ ] **Externalize cache TTL values**
  - Files: `api/suggestions/edhrec.ts` (24h), `api/results/*.ts` (6h)
  - Current: Hardcoded in code
  - Solution: Move to environment variables
    ```
    CACHE_TTL_EDHREC=86400000
    CACHE_TTL_TOURNAMENT=21600000
    ```

### Edge Cases & Parsing

- [ ] **Fix date parsing edge case in MTGTop8**
  - File: `api/results/mtgtop8.ts` (line 17)
  - Issue: `DD/MM/YY` format with Y2K-like pivot at year 70
  - Risk: Dates before 1970 misinterpreted
  - Fix: Use more explicit date validation
    ```typescript
    function parseMtgTop8Date(dateStr: string): string {
      const [day, month, year] = dateStr.split('/');
      const fullYear = parseInt(year) >= 70 ? `19${year}` : `20${year}`;
      // Validate ranges
      if (parseInt(month) < 1 || parseInt(month) > 12) return dateStr;
      if (parseInt(day) < 1 || parseInt(day) > 31) return dateStr;
      return `${fullYear}-${month}-${day}`;
    }
    ```

- [ ] **Validate HTML parsing in MTGTop8 scraper**
  - File: `api/results/mtgtop8.ts` (line 63)
  - Issue: If MTGTop8 returns malicious HTML, cheerio could misbehave
  - Risk: Low, but good defensive programming
  - Fix: Add HTML structure validation before parsing

- [ ] **Add environment validation at startup**
  - Current: Missing env vars only caught at first API call
  - Solution: Add health check that validates all required vars
  - File: `api/health.ts`
  - Check:
    - [ ] All required env vars present
    - [ ] Can connect to Supabase
    - [ ] External APIs reachable (with timeout)

---

## 🔵 LOW PRIORITY ISSUES (Code quality & best practices)

### Documentation

- [ ] **Add JSDoc comments to complex functions**
  - Files: `src/lib/cards.ts` (packColumns), API route handlers
  - Example:
    ```typescript
    /**
     * Packs card groups into columns for layout
     * @param groups - Card type groups with heights
     * @param maxColumns - Maximum columns available
     * @returns Packed columns with groups distributed
     */
    export function packColumns<T extends TypeGroup>(groups: T[], maxColumns: number): T[][] {
    ```

- [ ] **Document API endpoint requirements**
  - Create `API.md` or update `CLAUDE.md`
  - Include:
    - [ ] Request/response schemas
    - [ ] Rate limits
    - [ ] Authentication requirements
    - [ ] Example usage

### Code Quality

- [ ] **HTTP status codes follow spec**
  - Review all status codes in API routes
  - [ ] 400 for bad requests (validation errors)
  - [ ] 401 for unauthorized (auth failed)
  - [ ] 403 for forbidden (CORS, rate limit)
  - [ ] 404 for not found
  - [ ] 429 for rate limited
  - [ ] 500 for server errors
  - [ ] 502 vs 503 for external service issues

- [ ] **Add unique constraint on deck names (optional)**
  - Issue: Users can create multiple decks with same name
  - Decision: Clarify UX requirement (allow duplicates? scope by format?)
  - If enforcing: Add database constraint
    ```sql
    ALTER TABLE decks ADD UNIQUE(user_id, name);
    ```

- [ ] **Ensure service role key never bundled in frontend**
  - File: `src/lib/supabase.ts`
  - Verify: Only ANON_KEY is used in client code
  - Verify: Service role only in `api/` routes
  - Run check: `grep -r "SUPABASE_SERVICE_ROLE_KEY" src/`
  - Should return: 0 results (only in api/ should have it)

---

## 📊 PROGRESS TRACKING

### Phase 1: Critical Security Fixes (Before next deploy)
**Target:** All 🔴 items complete
- Secrets management: 1 / 2 (Rotate keys PENDING)
- Auth & validation: 2 / 2 ✅
- API security: 3 / 3 ✅
- **Total: 6 / 7 complete** (1 manual action remaining)

### Phase 2: Access & Headers (Next 2 weeks)
**Target:** All 🟠 items complete
- CORS & headers: 2 / 2 ✅
- Access control: 2 / 2 ✅
- Type safety: 2 / 2 ✅
- **Total: 6 / 6 complete** ✅ (PHASE COMPLETE!)

### Phase 3: Quality & Observability (Next month)
**Target:** All 🟡 and 🔵 items complete
- Observability: __ / 3
- Configuration: __ / 3
- Edge cases: __ / 3
- Code quality: __ / 3
- **Total: __ / 12**

### OVERALL PROGRESS
- 🔴 Critical: 6 / 7 complete (85.7%) ✅ *Only manual Supabase key rotation pending*
- 🟠 High: 6 / 6 complete (100%) ✅ **PHASE 2 COMPLETE!**
- 🟡 Medium: 0 / 6 complete (0%)
- 🔵 Low: 0 / 3 complete (0%)
- **TOTAL: 12 / 21 complete (57.1%)**

---

## 📝 NOTES & DECISIONS

### Completed (Phase 1: Critical Fixes)
- ✅ Created `src/lib/env.ts` - Centralized environment variable validation
- ✅ Created `src/lib/validation.ts` - Comprehensive input validation framework
- ✅ Created `src/lib/rateLimit.ts` - In-memory rate limiting with configurable limits
- ✅ Updated all 6 API routes with:
  - Proper environment variable handling
  - Input validation on all parameters
  - Rate limiting with X-RateLimit headers
  - Structured error logging
  - Request timeouts (10s) on external API calls
- ✅ Updated AuthForm to require minimum 12-character passwords
- ✅ Created `.env.example` template for developers
- ✅ Updated `.gitignore` to exclude `.env.local` files

### Completed (Phase 2: Access Control & Security Headers)
- ✅ Created `api/_lib/cors.ts` - CORS header utilities with origin verification
- ✅ Updated `vercel.json` - Added 7 security headers (OWASP standard)
- ✅ Applied CORS headers to all 6 API routes
- ✅ Added origin verification to 4 expensive endpoints (Moxfield, EDHREC, EDHTop16, MTGTop8)
- ✅ Created `src/lib/schemas.ts` - Lightweight runtime type validation (4 parsers)
- ✅ Card name validation working with character whitelist + length limits

### In Progress
<!-- Add items currently being worked on -->

### Deferred / Not Applicable
<!-- Add items that won't be fixed and why -->

### Manual Actions Required
- ⚠️ **IMPORTANT**: User must rotate exposed Supabase keys in Supabase dashboard
  - Current keys in `.env.local` are now exposed in git history
  - Generate new ANON_KEY and SERVICE_ROLE_KEY in Supabase settings
  - Update `.env.local` with new keys (file is now .gitignored)
  - The old keys should be revoked in Supabase to prevent unauthorized access

### Questions / Clarifications
<!-- Add any ambiguities -->

---

## 🎯 SUMMARY

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 7 | __ complete |
| 🟠 High | 5 | __ complete |
| 🟡 Medium | 6 | __ complete |
| 🔵 Low | 3 | __ complete |
| **TOTAL** | **21** | **__ / 21 complete** |

---

**Last Reviewed:** 2026-04-22  
**Next Review:** [Date to be set]  
**Owner:** [Assign owner]
