# MTG Deck Builder

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
    deck/       # EditDeckPage, ViewDeckPage, DeckSection, DeckCardItem, ComparePage
    cards/      # CardSearch, CardPreview
    auth/       # LoginForm, SignupForm
    Toast.tsx   # Lightweight toast notifications (auto-dismiss)
  lib/          # supabase.ts client init, cards.ts (shared type helpers)
  hooks/        # useAuth, useDeck
api/
  cards/
    search.ts           # GET /api/cards/search?q=<query>
    [scryfall_id].ts    # GET /api/cards/[scryfall_id]
  import/
    moxfield.ts         # POST /api/import/moxfield — import deck from Moxfield URL
  health.ts             # GET /api/health
scripts/
  seed-cards.ts         # Scryfall bulk data seeder
supabase/
  migrations/           # SQL migration files
```

## Database Schema

Three tables in Supabase:
- **cards** — Scryfall cache (seeded from bulk data, ~100k rows). Key columns: scryfall_id, name, mana_cost, cmc, type_line, colors, color_identity, set_code, image_uris (jsonb)
- **decks** — user decks. Key columns: user_id, name, format, description, is_public
- **deck_cards** — cards in a deck. Key columns: deck_id, card_id, section, quantity

RLS is enabled on all tables. Cards are publicly readable. Decks are owner-CRUD + public-read. Deck cards follow deck ownership.

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
- `/decks` — user deck dashboard with "My Decks" / "Utilities" tabs (protected)
- `/decks/new` — create new deck (protected)
- `/decks/:id/edit` — deck editor (protected)
- `/compare` — deck compare tool, imports two Moxfield decks and shows shared/unique cards (protected)
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
- Deck compare tool: `/compare` page imports two Moxfield decks via existing `/api/import/moxfield`, compares cards by name (case-insensitive), displays Shared / Unique to A / Unique to B grouped by card type
- Compare page uses same card column layout as deck editor (w-[200px] cards in w-[180px] columns, mt-[-238px] overlap) with sticky preview pane
- Card type helpers (`getCardType`, `TYPE_ORDER`) live in `src/lib/cards.ts` and are shared by DeckSection and ComparePage
- `/decks` page has tabbed layout: "My Decks" tab (default) and "Utilities" tab with link to Compare tool
- Moxfield import endpoint returns `name` field (deck name from Moxfield) in the response JSON

## MVP Progress

See `checklist.md` for current status. MVP complete and deployed. Moxfield import and deck compare features implemented.
