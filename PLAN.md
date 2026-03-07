# MTG Deck Builder — Project Plan

## Overview

A Moxfield-inspired Magic: The Gathering deck hosting site. Users can create accounts, build and save decks, search for cards with Scryfall integration, and manage decks via a drag-and-drop interface organized by section (mainboard, sideboard, commander, maybeboard, etc.).

---

## Tech Stack

### Frontend

- **React** (with Vite) — UI framework and build tool
- **Tailwind CSS** — utility-first styling
- **dnd-kit** — drag-and-drop between deck sections
- **Supabase JS client** — auth and database access from the frontend

### Backend

- **Vercel API Routes** — serverless functions for the Scryfall proxy/cache layer; no separate backend server needed

### Database & Auth

- **Supabase (PostgreSQL)** — user auth, deck storage, and card metadata cache

### External APIs

- **Scryfall API** — card data and search
- **Scryfall CDN** — card images (served directly from CDN, no proxying needed per Scryfall ToS)

### Deployment & CI/CD

- **GitHub** — source of truth; all code lives in a single monorepo
- **Vercel** — connected to the GitHub repo; auto-deploys on push to `main`, preview deployments on PRs/branches

---

## Deployment Architecture

```
GitHub Repo
    └── Vercel (auto-deploy on push)
            ├── React + Vite frontend (static)
            └── /api/* serverless functions (Scryfall proxy/cache)

Supabase
    ├── Auth (email/password + OAuth)
    ├── decks table
    ├── deck_cards table
    └── cards table (Scryfall cache)
```

---

## Database Schema

### `cards` (Scryfall cache — seeded from bulk data, not user-generated)

```sql
id            uuid primary key default gen_random_uuid()
scryfall_id   text unique not null
name          text not null
mana_cost     text
cmc           numeric
type_line     text
colors        text[]
color_identity text[]
set_code      text
image_uris    jsonb   -- { small, normal, large, png }
updated_at    timestamptz default now()
```

> Seed this table from Scryfall's bulk data download (https://scryfall.com/docs/api/bulk-data). Only store the columns above — this keeps the seed data around 50–80MB rather than the full ~250MB dump. Refresh weekly via a cron job or manual re-seed.

### `decks`

```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users not null
name        text not null
format      text  -- 'commander', 'standard', 'modern', etc.
description text
is_public   boolean default false
created_at  timestamptz default now()
updated_at  timestamptz default now()
```

### `deck_cards`

```sql
id          uuid primary key default gen_random_uuid()
deck_id     uuid references decks(id) on delete cascade not null
card_id     uuid references cards(id) not null
section     text not null  -- 'mainboard', 'sideboard', 'commander', 'maybeboard'
quantity    integer default 1
created_at  timestamptz default now()
```

---

## Vercel API Routes

### `GET /api/cards/search?q=<query>`

- Checks the Supabase `cards` table first (cache hit)
- On cache miss, fetches from Scryfall API and writes back to the cache
- Returns a trimmed card object (only the fields stored in the schema above)

### `GET /api/cards/[scryfall_id]`

- Single card lookup with the same cache-first logic

> Card images do NOT need to be proxied. Use Scryfall CDN URLs stored in `image_uris` directly in `<img>` tags.

---

## Key Features

### Auth

- Supabase Auth handles signup, login, and session management
- Use `@supabase/auth-helpers-react` for session context in React
- Protect deck creation/editing routes — public deck viewing can be unauthenticated

### Deck Page Layout

- Sections: **Commander**, **Mainboard**, **Sideboard**, **Maybeboard** (show/hide based on format)
	- Organize by card type, options to sort by name or mana value
	- make adding new sections/organizing easy in the future, this will be the main function
- Each section is a droppable container via dnd-kit
- Dragging a card between sections updates the `section` field in `deck_cards` via a Supabase update
- Card count totals per section shown in section headers

### Card Search

- Search bar hits `/api/cards/search`
- Results show card image preview on hover (from Scryfall CDN)
- Clicking a result adds the card to the selected deck section

### Deck Visibility

- Decks can be public or private (`is_public` flag)
- Public decks are viewable at a shareable URL without auth (e.g. `/deck/[id]`)

---

## Caching Strategy

- **Primary cache**: Supabase `cards` table, seeded from Scryfall bulk data
- **Fallback**: Live Scryfall API call on cache miss, result written back to `cards` table
- **Images**: Always served from Scryfall CDN — no image storage needed, does not count against Supabase storage
- **Storage budget**: ~50–80MB for cards table seed, leaving ~420–450MB free for future use

---

## Supabase Free Tier Notes

- Projects pause after **1 week of inactivity** — set up a cron ping via [cron-job.org](https://cron-job.org/) to a lightweight health endpoint (e.g. `GET /api/health`) every few days
- 500MB storage total — seeding only the necessary card columns keeps this well under budget
- 2 active projects max on free tier

## Vercel Free Tier Notes

- 100GB bandwidth/month — more than enough for personal use
- Serverless functions time out at **10 seconds** — Scryfall API calls are fast, this won't be an issue
- Auto preview deployments per branch — use this for feature development

---

## Suggested Project Structure

```
/
├── src/
│   ├── components/
│   │   ├── deck/          # DeckPage, DeckSection, DraggableCard
│   │   ├── cards/         # CardSearch, CardPreview
│   │   └── auth/          # LoginForm, SignupForm
│   ├── pages/             # or use React Router
│   ├── lib/
│   │   ├── supabase.ts    # Supabase client init
│   │   └── scryfall.ts    # helpers for /api/cards/*
│   └── hooks/             # useAuth, useDeck, useDragAndDrop
├── api/
│   └── cards/
│       ├── search.ts
│       └── [scryfall_id].ts
├── public/
├── .env.local             # SUPABASE_URL, SUPABASE_ANON_KEY
└── vite.config.ts
```

---

## Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # for API routes only, never exposed to client
```

Set all three in Vercel's project environment variable settings, and locally in `.env.local`.

---

## Getting Started Checklist

- [x] Create GitHub repo
- [ ] Scaffold with `npm create vite@latest` (React + TypeScript)
- [ ] Install Tailwind, dnd-kit, Supabase JS client
- [ ] Connect repo to Vercel
- [ ] Create Supabase project, run schema migrations
- [ ] Seed `cards` table from Scryfall bulk data
- [ ] Set environment variables in both `.env.local` and Vercel dashboard
- [ ] Build auth flow first, then deck CRUD, then drag-and-drop UI
