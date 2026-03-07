# MTG Deck Builder

A Moxfield-inspired Magic: The Gathering deck hosting site. Build, save, and share decks with drag-and-drop organization by section.

## Tech Stack

- **React** + **Vite** + **TypeScript** — frontend
- **Tailwind CSS v4** — styling
- **dnd-kit** — drag-and-drop between deck sections
- **Supabase** — PostgreSQL database + authentication
- **Vercel** — hosting + serverless API routes
- **Scryfall** — card data and images

## Getting Started

### Prerequisites

- Node.js
- A [Supabase](https://supabase.com) project
- [Vercel CLI](https://vercel.com/docs/cli) (for local API route development)

### Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/your-user/deckbuilder.git
   cd deckbuilder
   npm install
   ```

2. Create `.env.local` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. Run the database migration in Supabase SQL Editor:
   ```
   supabase/migrations/001_initial_schema.sql
   ```

4. Seed the card database from Scryfall (~100k cards):
   ```bash
   npx tsx scripts/seed-cards.ts
   ```

5. Start the dev server:
   ```bash
   npm run dev        # frontend only
   vercel dev         # frontend + API routes
   ```

## Project Structure

```
src/
  components/
    auth/          # login, signup
    cards/         # card search, preview
    deck/          # deck page, sections, draggable cards
  hooks/           # useAuth, useDeck, useDragAndDrop
  lib/             # Supabase client, Scryfall helpers
api/               # Vercel serverless functions
  cards/
    search.ts      # GET /api/cards/search?q=<query>
    [scryfall_id].ts  # GET /api/cards/[scryfall_id]
  health.ts        # GET /api/health
scripts/
  seed-cards.ts    # Scryfall bulk data seeder
supabase/
  migrations/      # SQL schema migrations
```

## API Routes

| Route | Description |
|---|---|
| `GET /api/cards/search?q=<query>` | Search cards by name (cache-first, Scryfall fallback) |
| `GET /api/cards/[scryfall_id]` | Lookup a single card by Scryfall ID |
| `GET /api/health` | Health check endpoint |
