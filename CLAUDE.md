# MTG Deck Builder

## Memory & Session Notes

On every conversation start:
- Read `/home/rt/.claude/projects/-home-rt-Code-deckbuilder/memory/MEMORY.md` and any referenced session files that seem relevant to the current task.

After any meaningful changes (new features, bug fixes, architectural decisions, lessons learned):
- Update or create the appropriate memory file(s) in `/home/rt/.claude/projects/-home-rt-Code-deckbuilder/memory/`
- Create a session notes file named `session_YYYY-MM-DD.md` (use today's date) summarizing what was done
- Add a pointer to the session file in `MEMORY.md` under the Sessions section

## Project Overview

A Moxfield-inspired MTG deck hosting site. Users create accounts, build/save decks, search cards via Scryfall, and manage decks with click-to-expand cards and right-click context menus organized by section.

## Tech Stack

- **Frontend**: React + Vite + TypeScript, Tailwind CSS v4, React Router
- **Backend**: Vercel serverless API routes (no separate server)
- **Database & Auth**: Supabase (PostgreSQL + Auth)
- **External**: Scryfall API for card data, Scryfall CDN for card images (no proxying)

## Project Structure

```
src/
  components/
    deck/       # EditDeckPage, ViewDeckPage, DeckSection, DeckCardItem, ComparePage,
                # SuggestionsPanel, ResultsPanel
    cards/      # CardSearch, CardPreview
    auth/       # LoginForm, SignupForm
    Toast.tsx   # Lightweight toast notifications (auto-dismiss)
  lib/          # supabase.ts client init, cards.ts (shared type helpers + column layout)
  hooks/        # useAuth, useDeck, useMaxColumns
api/
  cards/
    search.ts           # GET /api/cards/search?q=<query>
    [scryfall_id].ts    # GET /api/cards/[scryfall_id]
  import/
    moxfield.ts         # POST /api/import/moxfield — import deck from Moxfield URL
  suggestions/
    edhrec.ts           # GET /api/suggestions/edhrec?commander={name} — EDHREC recommendations
  results/
    edhtop16.ts         # GET /api/results/edhtop16?commander={name} — cEDH tournament results
    mtgtop8.ts          # GET /api/results/mtgtop8?commander={name} — Duel Commander results
  health.ts             # GET /api/health
scripts/
  seed-cards.ts         # Scryfall bulk data seeder
supabase/
  migrations/           # SQL migration files
```

## Database Schema

Five tables in Supabase:
- **cards** — Scryfall cache (seeded from bulk data, ~100k rows). Key columns: scryfall_id, name, mana_cost, cmc, type_line, colors, color_identity, set_code, image_uris (jsonb)
- **decks** — user decks. Key columns: user_id, name, format, description, is_public
- **deck_cards** — cards in a deck. Key columns: deck_id, card_id, section, quantity
- **edhrec_cache** — EDHREC card recommendations cache. Key columns: commander_name (slug, unique), data (jsonb), fetched_at. 24h TTL
- **tournament_cache** — Tournament results cache. Key columns: commander_name, source ('edhtop16'|'mtgtop8'), data (jsonb), fetched_at. unique(commander_name, source). 6h TTL

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
- `/decks` — user deck dashboard with "My Decks" / "Utilities" tabs; My Decks shows format folders (protected)
- `/decks?format=X` — filtered deck list for a specific format (protected)
- `/decks/new` — create new deck (protected)
- `/decks/:id/edit` — deck editor (protected)
- `/compare` — deck compare tool, imports 2+ Moxfield decks and shows shared/unique cards (protected)
- `/deck/:id` — public read-only deck view (no auth required, respects `is_public` flag)

## Key Decisions

- Card images served directly from Scryfall CDN, not proxied (per Scryfall ToS)
- Cards table seeded from Scryfall bulk data (~100k English non-digital cards), with live API fallback on cache miss
- Tailwind CSS v4 configured via `@tailwindcss/vite` plugin (no tailwind.config, uses `@import "tailwindcss"` in CSS)
- Supabase free tier — project pauses after 1 week of inactivity, use cron ping to `/api/health`
- Moxfield import: server-side fetch from Moxfield API, cards looked up/inserted via Scryfall `/cards/collection` endpoint (never trust Moxfield for image data)
- Deck editor uses 3-dot dropdown menu for Share, Edit Details, and Import from Moxfield
- Toast notifications for deck actions (add, remove, move, import, version change) — auto-dismiss after 2s, bottom-right corner
- Portaled modals (e.g. version picker) need explicit `text-white` since they escape the dark-themed component tree
- Deck compare tool: `/compare` page imports N Moxfield decks (2+ URLs, dynamically add/remove) via existing `/api/import/moxfield`, compares cards by name (case-insensitive), displays Shared (in all decks) / Unique to each deck, grouped by card type
- Compare page uses same card column layout as deck editor (w-[200px] cards in w-[180px] columns, mt-[-238px] overlap) with sticky preview pane
- Card type helpers (`getCardType`, `TYPE_ORDER`), `packColumns()`, and layout constants (`COLUMN_WIDTH`, `COLUMN_GAP`) live in `src/lib/cards.ts`, shared by DeckSection and ComparePage
- Column packing: `packColumns(groups, maxColumns)` only combines type groups into shared columns when they would overflow the container width. If all groups fit, each gets its own column in TYPE_ORDER (no packing). `useMaxColumns` hook measures container width via ResizeObserver and recomputes on resize
- `/decks` page has tabbed layout: "My Decks" tab (default) and "Utilities" tab with link to Compare tool. My Decks groups decks into format folders; clicking a folder navigates to `?format=X` showing filtered list with back button
- Moxfield import endpoint returns `name` field (deck name from Moxfield) in the response JSON
- Suggestions & Results: format-aware header buttons in deck editor — Commander → "Suggestions" (EDHREC), cEDH → "Results" (EDHTop16), Duel Commander → "Results" (MTGTop8). Buttons only show when commander card exists
- External data cached server-side in Supabase: edhrec_cache (24h TTL), tournament_cache (6h TTL, keyed by commander_name+source)
- EDHREC API: JSON at `json.edhrec.com/pages/commanders/{slug}.json`, cardlists at `container.json_dict.cardlists`, partner commanders use `slug1/slug2` URL format, `inclusion` is raw count (divide by `potential_decks` for percentage)
- EDHTop16 GraphQL API: `commander(name).entries(first, sortBy, filters)` with Relay cursor pagination (edges/node pattern), player is object with name field
- MTGTop8 scraping: HTML parsed with cheerio, results in `tr.hover_tr` rows with 8 columns, dates in DD/MM/YY format, includes `fallback_url` on scraping failure
- Formats with commander section: Commander, cEDH, Duel Commander (all get Commander+Mainboard+Sideboard default sections)

## MVP Progress

See `checklist.md` for current status. MVP complete and deployed. Moxfield import, deck compare, and suggestions/tournament results features implemented.
