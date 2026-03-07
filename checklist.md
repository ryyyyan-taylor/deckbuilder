# MVP Checklist

Minimum viable product: a user can sign up, create a deck, search for cards, add them to sections, drag cards between sections, and share a public deck link.

---

## 1. Project Scaffolding

- [x] Scaffold with `npm create vite@latest` (React + TypeScript)
- [x] Install dependencies: Tailwind CSS, dnd-kit, Supabase JS client, React Router
- [x] Set up project structure (`src/components/`, `src/lib/`, `src/hooks/`, `api/`)
- [x] Configure Tailwind CSS
- [x] Create `.env.local` with Supabase env vars
- [x] Add `.env.local` to `.gitignore`

## 2. Supabase Setup

- [x] Create Supabase project
- [x] Run schema migrations (`cards`, `decks`, `deck_cards` tables)
- [x] Set up Row Level Security (RLS) policies:
  - Public read for public decks
  - Authenticated CRUD for own decks/deck_cards
- [x] Seed `cards` table from Scryfall bulk data (trimmed to required columns)

## 3. Vercel API Routes

- [x] `GET /api/cards/search?q=<query>` — cache-first card search
- [x] `GET /api/cards/[scryfall_id]` — single card lookup
- [x] `GET /api/health` — health endpoint for cron keep-alive

## 4. Supabase Client & Auth

- [ ] Initialize Supabase client (`src/lib/supabase.ts`)
- [ ] Build signup page
- [ ] Build login page
- [ ] Add session context / auth provider (`useAuth` hook)
- [ ] Add protected route wrapper (redirect unauthenticated users)
- [ ] Add logout functionality

## 5. Deck CRUD

- [ ] Create deck form (name, format, description, public/private)
- [ ] List user's decks on a dashboard page
- [ ] Delete deck
- [ ] Edit deck metadata (name, format, description, visibility)

## 6. Card Search

- [ ] Search bar component hitting `/api/cards/search`
- [ ] Display search results as a list
- [ ] Card image preview on hover (Scryfall CDN)
- [ ] Click result to add card to the active deck section

## 7. Deck Page & Drag-and-Drop

- [ ] Deck page layout with sections (Commander, Mainboard, Sideboard, Maybeboard)
- [ ] Show/hide sections based on format
- [ ] Display cards in each section with quantity
- [ ] Card count totals in section headers
- [ ] dnd-kit: make cards draggable between sections
- [ ] On drop, update `section` field in `deck_cards` via Supabase
- [ ] Remove card / adjust quantity controls

## 8. Public Deck Viewing

- [ ] Public deck route (`/deck/[id]`) — no auth required
- [ ] Read-only deck view with all sections visible
- [ ] Shareable URL

## 9. Routing

- [ ] Set up React Router with routes:
  - `/` — landing / redirect
  - `/login`, `/signup`
  - `/decks` — user dashboard
  - `/decks/:id/edit` — deck editor (authenticated)
  - `/deck/:id` — public deck view

## 10. Deployment

- [ ] Connect GitHub repo to Vercel
- [ ] Set environment variables in Vercel dashboard
- [ ] Verify preview deployment works on a branch push
- [ ] Set up cron ping to `/api/health` to prevent Supabase pausing
