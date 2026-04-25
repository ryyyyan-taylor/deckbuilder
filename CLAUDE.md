# MTG Deck Builder

## Memory & Session Notes

On every conversation start:
- Read `/home/rt/.claude/projects/-home-rt-Code-deckbuilder/memory/MEMORY.md` and any referenced session files that seem relevant to the current task.

After any meaningful changes (new features, bug fixes, architectural decisions, lessons learned):
- Update or create the appropriate memory file(s) in `/home/rt/.claude/projects/-home-rt-Code-deckbuilder/memory/`
- Create a session notes file named `session_YYYY-MM-DD.md` (use today's date) summarizing what was done
- Add a pointer to the session file in `MEMORY.md` under the Sessions section

## Project Overview

A Moxfield-inspired deck hosting site supporting **Magic: The Gathering (MTG)** and **Star Wars: Unlimited (SWU)** card games. Users create accounts, build/save decks, search cards via game-specific APIs (Scryfall for MTG, SWUAPI for SWU), and manage decks with click-to-expand cards and right-click context menus organized by sections. Users toggle between MTG and SWU views via the game selector on `/decks` and public decks page; selection persists via URL params and localStorage.

## Tech Stack

- **Frontend**: React + Vite + TypeScript, Tailwind CSS v4, React Router
- **Backend**: Vercel serverless API routes (no separate server)
- **Database & Auth**: Supabase (PostgreSQL + Auth)
- **External**: Scryfall API for MTG card data (Scryfall CDN for images), SWUAPI for SWU card data (no proxying)

## Project Structure

```
src/
  components/
    deck/       # EditDeckPage, ViewDeckPage, DeckSection, DeckCardItem, ComparePage,
                # SuggestionsPanel, ResultsPanel, StatsPanel, SandboxPage
    cards/      # CardSearch, CardPreview
    auth/       # LoginForm, SignupForm
    Toast.tsx   # Lightweight toast notifications (auto-dismiss)
  lib/          # supabase.ts client init, cards.ts (shared type helpers + column layout)
  hooks/        # useAuth, useDeck, useMaxColumns, useSandboxDeck
api/
  cards/
    search.ts           # GET /api/cards/search?q=<query>&game=<mtg|swu>
    [scryfall_id].ts    # GET /api/cards/[scryfall_id]?game=<mtg|swu>
  import/
    moxfield.ts         # POST /api/import/moxfield — import MTG deck from Moxfield URL
    swudb.ts            # POST /api/import/swudb — import SWU deck from SWUDB URL
  suggestions/
    edhrec.ts           # GET /api/suggestions/edhrec?commander={name} — EDHREC recommendations
  results/
    edhtop16.ts         # GET /api/results/edhtop16?commander={name} — cEDH tournament results
    mtgtop8.ts          # GET /api/results/mtgtop8?commander={name} — Duel Commander results
  health.ts             # GET /api/health
scripts/
  seed-cards.ts         # Scryfall bulk data seeder (MTG)
  seed-swu.ts           # SWUAPI seeder (SWU)
supabase/
  migrations/           # SQL migration files
```

## Database Schema

Six tables in Supabase:
- **cards** — MTG + SWU card cache. Seeded from Scryfall (~100k MTG) + SWUAPI (~8k SWU). Key columns: scryfall_id, name, game ('mtg'|'swu'), set_code, image_uris (jsonb). MTG-specific: mana_cost, cmc, colors, color_identity. SWU-specific: cost, arena, hp, power, aspects[], swu_type. Unique constraint: (scryfall_id, game)
- **decks** — user decks. Key columns: user_id, name, format, game ('mtg'|'swu'), description, is_public
- **deck_cards** — cards in a deck. Key columns: deck_id, card_id, section, quantity
- **edhrec_cache** — EDHREC card recommendations cache (MTG only). Key columns: commander_name (slug, unique), data (jsonb), fetched_at. 24h TTL
- **tournament_cache** — Tournament results cache (MTG only). Key columns: commander_name, source ('edhtop16'|'mtgtop8'), data (jsonb), fetched_at. unique(commander_name, source). 6h TTL

RLS is enabled on all tables. Cards and cache tables are publicly readable. Decks are owner-CRUD + public-read. Deck cards follow deck ownership. Cache writes via service role key.

## Environment Variables

```
VITE_SUPABASE_URL=         # Supabase project URL (exposed to client)
VITE_SUPABASE_ANON_KEY=    # Supabase anon key (exposed to client)
SUPABASE_SERVICE_ROLE_KEY= # Service role key (API routes only, never client)
```

Set in `.env.local` locally and in Vercel dashboard for deployment.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — TypeScript check + production build
- `npm run lint` — ESLint
- `npx tsx scripts/seed-cards.ts` — seed/refresh Scryfall card data
- `vercel dev` — local dev with API routes
- `vercel` — deploy preview

## Routes

- `/` — redirects to `/decks` (logged in) or `/login` (not)
- `/login`, `/signup` — auth pages
- `/decks` — user deck dashboard with "My Decks" / "Utilities" tabs; game toggle (MTG/SWU) in header; My Decks shows format folders per game (protected)
- `/decks?game=mtg|swu` — game-filtered deck list with sticky localStorage fallback (protected)
- `/decks?format=X` — filtered deck list for a specific format (protected)
- `/decks/new?game=mtg|swu` — create new deck in specified game (protected)
- `/decks/:id/edit` — deck editor; game inferred from `deck.game` (protected)
- `/compare?game=mtg|swu` — deck compare tool locked to one game; slots support saved decks, Moxfield URLs (MTG), or SWUDB URLs (SWU) (protected)
- `/compare?deck=<id>&game=<inferred>` — compare pre-filled with a specific deck (protected)
- `/sandbox?game=mtg|swu` — ephemeral deck editor (sessionStorage, no DB save, clears on hard refresh/tab close) (protected)
- `/deck/:id` — public read-only deck view (no auth required, respects `is_public` flag); game badge visible

## Key Decisions

- Card images served directly from Scryfall CDN, not proxied (per Scryfall ToS)
- Cards table seeded from Scryfall bulk data (~100k English non-digital cards), with live API fallback on cache miss
- Tailwind CSS v4 configured via `@tailwindcss/vite` plugin (no tailwind.config, uses `@import "tailwindcss"` in CSS)
- Supabase free tier — project pauses after 1 week of inactivity, use cron ping to `/api/health`
- Moxfield import: server-side fetch from Moxfield API, cards looked up/inserted via Scryfall `/cards/collection` endpoint (never trust Moxfield for image data)
- Deck editor: two-row desktop header — top row: Suggestions/Results/Compare/Share/Edit Details/Bulk Edit (Import appears here only when in bulk edit mode); second row: Name/Mana Value sort toggle (hidden in bulk edit mode). Mobile uses 3-dot menu with same items
- Compare button in deck editor links to `/compare?deck=<id>`, pre-filling slot 0 with the current deck
- Toast notifications for deck actions (add, remove, move, import, version change) — auto-dismiss after 2s, bottom-right corner
- Portaled modals (e.g. version picker) need explicit `text-white` since they escape the dark-themed component tree
- Deck compare tool: `/compare?deck=<id>` pre-fills slot 0 via `useSearchParams`. Supports N slots (2+, dynamically add/remove), each slot is either a saved user deck (searchable combobox) or a Moxfield URL (text input), selected via a small source-type dropdown. Compares cards by name (case-insensitive, DFC-aware), displays Shared (in all decks) / Unique to each deck, grouped by card type. Only Mainboard section compared (`MAIN_SECTIONS = new Set(['Mainboard'])`); Commander/Sideboard/Maybeboard excluded
- Compare page: right-click any card to add it to a section of the slot 0 deck. Context menu derived from `slots[0]` (must be a saved deck). Replicates `addCardToDeck` logic (increment or insert). Menu width `w-max max-w-[160px]` to prevent long deck names expanding it. Brief toast confirms each add
- Compare page: each section box has a "Copy Section" button (top-right) that copies all card names alphabetically to clipboard, one per line. Shows "Copied!" for 1.5s
- Compare page uses same card column layout as deck editor (w-[200px] cards in w-[180px] columns, mt-[-238px] overlap) with sticky preview pane
- Compare DFC handling: card names normalized with `.replace(/ \/\/ .+$/, '')` before comparison so "Birgi, God of Storytelling // Harnfel, Horn of Bounty" matches "Birgi, God of Storytelling"
- Moxfield import stale scryfall_id fallback: if Moxfield returns an ID that 404s on Scryfall, fall back to DB lookup by card name, then Scryfall `/cards/named?exact=` — patches idMap so the card is still returned
- Sandbox: `/sandbox` route uses `useSandboxDeck` hook — same API shape as `useDeck` but all state in sessionStorage + React state, no DB writes. `SANDBOX_ID = 'sandbox'`. Persists across soft reloads (F5), cleared on hard refresh or tab close. `SandboxPage` mirrors `EditDeckPage` with Reset button (clears to empty) instead of Share, and a "Sandbox" badge in the header. **Any visual or UI changes made to `EditDeckPage` (new controls, view modes, layout tweaks, etc.) must also be applied to `SandboxPage` to keep them in sync.**
- Utilities tab in `/decks` contains both Compare Decks and Deck Sandbox links
- Card type helpers (`getCardType`, `TYPE_ORDER`), `packColumns()`, and layout constants (`COLUMN_WIDTH`, `COLUMN_GAP`) live in `src/lib/cards.ts`, shared by DeckSection and ComparePage
- Column packing: `packColumns(groups, maxColumns)` only combines type groups into shared columns when they would overflow the container width. If all groups fit, each gets its own column in TYPE_ORDER (no packing). When packing is needed: priority merges (Artifact+Enchantment, Instant+Sorcery) first, then First Fit Decreasing bin-packing (tallest groups first so anchors like Creatures/Lands claim their own columns). TYPE_ORDER restored within columns and left-to-right after packing. `useMaxColumns` hook measures container width via ResizeObserver and recomputes on resize
- Stats section: `"Stats"` stored as sentinel string in `deck.sections` (no schema change). Added silently on first deck load. `PROTECTED_SECTIONS = ['Mainboard', 'Stats']` — no rename/delete. `cardSections = sections.filter(s => s !== 'Stats')` used everywhere cards are involved. StatsPanel renders mana curve (Recharts BarChart), color pip bars, card type breakdown
- Section reordering: pills in section bar are draggable via `@dnd-kit/sortable`, `PointerSensor` with 5px distance constraint. × button uses `onPointerDown` stopPropagation to prevent drag on delete click. Order persists to Supabase via `updateSections`
- CI: GitHub Actions at `.github/workflows/ci.yml` — runs lint + typecheck + build on push/PR to main. Uses `actions/checkout@v6` + `actions/setup-node@v6` (Node 24 native). Vercel handles CD automatically via GitHub integration
- `/decks` page has tabbed layout: "My Decks" tab (default) and "Utilities" tab with link to Compare tool. My Decks groups decks into format folders; clicking a folder navigates to `?format=X` showing filtered list with back button
- Moxfield import endpoint returns `name` field (deck name from Moxfield) in the response JSON
- Suggestions & Results: format-aware header buttons in deck editor — Commander → "Suggestions" (EDHREC), cEDH → "Results" (EDHTop16), Duel Commander → "Results" (MTGTop8). Buttons only show when commander card exists
- External data cached server-side in Supabase: edhrec_cache (24h TTL), tournament_cache (6h TTL, keyed by commander_name+source)
- EDHREC API: JSON at `json.edhrec.com/pages/commanders/{slug}.json`, cardlists at `container.json_dict.cardlists`, partner commanders use `slug1/slug2` URL format, `inclusion` is raw count (divide by `potential_decks` for percentage)
- EDHTop16 GraphQL API: `commander(name).entries(first, sortBy, filters)` with Relay cursor pagination (edges/node pattern), player is object with name field
- MTGTop8 scraping: HTML parsed with cheerio, results in `tr.hover_tr` rows with 8 columns, dates in DD/MM/YY format, includes `fallback_url` on scraping failure
- Formats with commander section: Commander, cEDH, Duel Commander (all get Commander+Mainboard+Sideboard default sections)

## Games — MTG & SWU Support

The application supports two card games with a polymorphic, game-aware architecture:

### Schema & types

- **Deck-level polymorphism**: Each deck has a `game` column ('mtg'|'swu'). Once created, game is immutable for that deck.
- **Card-level polymorphism**: The `cards` table stores both MTG and SWU cards. Unique constraint is `(scryfall_id, game)` — same external ID can exist for both games.
- **Game-specific columns**: 
  - MTG: mana_cost, cmc, colors, color_identity, oracle_text
  - SWU: cost, arena ('Ground'|'Space'), hp, power, aspects (array), swu_type ('Leader'|'Base'|'Unit'|'Event'|'Upgrade')
  - Shared: name, set_code, type_line, image_uris (jsonb)

### Game toggle & persistence

- **Game selector**: `<GameToggle />` component in `/decks`, `/decks?game=...&format=...`, and public decks page. Two-button segmented control (MTG/SWU icons).
- **URL params**: `?game=mtg|swu` on `/decks`, `/compare`, `/sandbox`. Router params override localStorage.
- **Storage fallback**: `localStorage.preferredGame` persists user's last choice. Fresh visit defaults to MTG.
- **Inside a deck**: Game is never a URL param in `/decks/:id/edit` — inferred from `deck.game` (immutable).

### Format & section handling

**Formats by game** (from `src/lib/games.tsx`):
- MTG: Standard, Modern, Pioneer, Legacy, Vintage, Commander, cEDH, Duel Commander, Pauper, Draft, Other
- SWU: Premier, Twin Suns

**Default sections by game & format** (from `src/lib/games.tsx::getDefaultSections`):
- MTG Commander/cEDH/Duel: Commander + Mainboard + Sideboard + Stats + Test
- MTG other formats: Mainboard + Sideboard + Stats + Test
- SWU (all formats): Leader/Base + Ground Units + Space Units + Events + Upgrades + Sideboard + Stats + Test

**Protected sections** (cannot rename/delete; from `src/lib/games.tsx::getProtectedSections`):
- MTG Commander/cEDH/Duel: Mainboard + Commander + Stats + Test
- MTG other: Mainboard + Stats + Test
- SWU: Leader/Base + Stats + Test

**Main sections** (used for stats, comparison; from `src/lib/games.tsx::getMainSections`):
- MTG: ['Mainboard']
- SWU: ['Ground Units', 'Space Units', 'Events', 'Upgrades'] (excludes Leader/Base which is separate, excludes Sideboard)

### Card type & image rendering

**Type system** (from `src/lib/cards.ts` and `src/lib/swu.ts`):
- `getCardType(card, game)` — dispatches to MTG or SWU type parser. SWU splits generic 'Unit' into 'Ground Unit'/'Space Unit' based on arena.
- `getTypeOrder(game)` — returns game-specific type order for column packing.
- `cardImageUrl(card, game, size?)` — returns correct image URL. MTG uses Scryfall CDN; SWU uses SWUDB CDN.

**Leader flips**: SWU leaders have two-sided art (front + back). Stored as separate images in `image_uris` jsonb. DFC normalization (strip ` // `) applies to SWU leader names too.

### API endpoints

**Game-parameterized**:
- `/api/cards/search?q=<query>&game=mtg|swu` — searches MTG (Scryfall) or SWU (SWUDB) with fallback to DB lookup.
- `/api/cards/[id]?game=mtg|swu` — same pattern for single-card fetch.

**Game-specific imports**:
- `/api/import/moxfield` — MTG deck import from Moxfield URL. Uses Scryfall collection endpoint for batch card lookup.
- `/api/import/swudb` — SWU deck import from SWUDB URL. Fetches from `https://swudb.com/deck/{id}.json`, splits main deck by card type into game-specific sections.

**Game-independent**:
- `/api/suggestions/edhrec`, `/api/results/edhtop16`, `/api/results/mtgtop8` — MTG only, no game param needed.

### Sandbox & Compare gating

- **One game per session**: `?game=` URL param read once on component mount. Users cannot mix games in a single sandbox or compare session.
- **Sandbox per game**: State stored in `sessionStorage` under `sandbox_mtg` or `sandbox_swu` keys. Resetting one game does not affect the other.
- **Compare per game**: Slot saved-deck queries filtered by game. Slot type dropdown shows "Moxfield URL" for MTG, "SWUDB URL" for SWU.
- **Main sections**: Comparison logic iterates over `getMainSections(game)` — 1 section for MTG (Mainboard), 4 sections for SWU.

### Stats panel

- **MTG**: Mana curve (0–7+ cost buckets), color pips (W/U/B/R/G/C), land production (tap-for-mana analysis).
- **SWU**: Cost curve (0–7+ cost buckets, same Recharts scaffold as MTG), aspect pips (6 colored circles: Vigilance/Command/Aggression/Cunning/Heroism/Villainy), card type breakdown (Leader/Base/Ground Unit/Space Unit/Event/Upgrade).

**Calculation**: Both use `getMainSections(game)` to filter which sections count as "the deck" for stats. Sideboard excluded.

### Seeding & maintenance

- **MTG seeder** (`scripts/seed-cards.ts`): Fetches Scryfall bulk data, inserts with `game='mtg'`.
- **SWU seeder** (`scripts/seed-swu.ts`): Fetches SWUAPI bulk export, inserts with `game='swu'`. ~8k cards.
- **Upsert strategy**: Both use `onConflict: 'scryfall_id,game'` to safely rerun without duplicates.

### Code patterns

**Game dispatch in components**:
```tsx
// Simple branch at component level
if (game === 'swu') return <StatsPanelSwu ... />
return <StatsPanelMtg ... />

// Or pass game to child, let it decide
<DeckSection cards={...} game={game} />
```

**Game-aware API calls**:
```tsx
const res = await fetch(`/api/cards/search?q=${query}&game=${game}`)
```

**Library dispatching**:
```tsx
const typeOrder = getTypeOrder(game)
const cardType = getCardType(card, game)
```

## Security & Reliability

The application is production-hardened with comprehensive security controls:

- **Input Validation**: All API endpoints validate and sanitize user input (card names, URLs, commander names, query strings)
- **Rate Limiting**: Per-IP rate limiting on all endpoints (20–100 req/min depending on endpoint cost)
- **CORS & Headers**: Origin verification on expensive endpoints; 7 OWASP security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Type Safety**: Runtime schema validation on all API responses; TypeScript strict mode throughout
- **Error Handling**: React error boundary + structured logging with context; graceful fallbacks on API failures
- **Environment Isolation**: Service role key never exposed to client; proper env var validation at startup
- **Caching Safety**: All external data cached server-side (EDHREC 24h, tournament 6h); Supabase RLS enforces access control
- **API Timeouts**: 10-second timeout on all external API calls (Moxfield, EDHREC, EDHTop16, MTGTop8)

See `QA_CHECKLIST.md` for full security audit and `API.md` for endpoint documentation.

## MVP Progress

See `checklist.md` for current status. MVP complete and deployed. Post-MVP additions: Stats section, section drag-and-drop reordering, CI pipeline, FFD bin-packing improvement, flat header buttons, bulk edit mode, Commander section protection, saved-deck compare sources, deck sandbox. Security hardening complete (Phase 1–3 QA review: 21/21 items implemented).
