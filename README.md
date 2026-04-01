<img src="public/favicon.svg" width="48" height="48" align="left" style="margin-right: 12px">

# MTG Deck Builder

A Moxfield-inspired Magic: The Gathering deck hosting site. Build and share decks with a visual card layout, Scryfall-powered card search, and tools for competitive and casual play.

**Live at [deckbuilder.ryantaylor.tech](https://deckbuilder.ryantaylor.tech)** &nbsp; ![CI](https://github.com/ryyyyan-taylor/deckbuilder/actions/workflows/ci.yml/badge.svg)

---

## Features

### Deck Building
- Search across ~100k Magic cards powered by the Scryfall database
- Organize cards into sections: Commander, Mainboard, Sideboard, and more
- Cards displayed in stacked columns grouped by type (Creatures, Instants, Sorceries, Lands, etc.)
- Intelligent column layout — groups are packed to fit the available width, with priority merges for Artifact+Enchantment and Instant+Sorcery
- Click any card to expand it and adjust quantity; right-click to send it to another section
- Inline card preview pane that follows your cursor
- **Stats section** — mana curve bar chart, color pip distribution, and card type breakdown; always present alongside card sections
- Drag-and-drop section reordering — all sections (including Stats) can be repositioned; order persists per deck

### Format Support
- Supports Commander, cEDH, Duel Commander, Standard, Modern, Legacy, and more
- Formats with a Commander section get Commander + Mainboard + Sideboard by default

### Moxfield Import
- Paste a Moxfield deck URL to import an entire deck in one click
- Cards are resolved against the local Scryfall cache with live API fallback for misses
- Deck name is imported automatically

### Deck Compare
- Import 2 or more Moxfield decks and compare them side-by-side
- See cards shared across all decks and cards unique to each, grouped by type
- Useful for comparing commander lists or finding overlap between builds

### Suggestions & Tournament Results
- **Commander** decks get EDHREC card suggestions with inclusion percentages
- **cEDH** decks surface recent EDHTop16 tournament top-8 results
- **Duel Commander** decks surface recent MTGTop8 results
- All external data is cached server-side (EDHREC: 24h, tournament data: 6h)

### Sharing & Discovery
- Public deck URLs shareable without an account (`/deck/:id`)
- My Decks page groups your decks by format into collapsible folders

**Example decks (no account required):**
| Format | Deck |
|---|---|
| Casual Commander | [View deck](https://deckbuilder.ryantaylor.tech/deck/35664d7d-7001-42b1-adce-ba3f25adfc8a/) |
| cEDH | [View deck](https://deckbuilder.ryantaylor.tech/deck/622af3b2-8e86-49dd-a34f-7b6a42162fc9/) |
| Duel Commander | [View deck](https://deckbuilder.ryantaylor.tech/deck/25e372fc-b098-45e5-a218-8a1f8ddeb84a/) |
| Modern | [View deck](https://deckbuilder.ryantaylor.tech/deck/95671a75-3c38-49ea-a6d3-13aabfa9e3e3/) |

---

## Technical Details

### Stack
- **React + Vite + TypeScript** — frontend SPA
- **Tailwind CSS v4** — utility-first styling
- **Supabase** — PostgreSQL database + row-level security + auth
- **Vercel** — hosting + serverless API routes (no separate server process)
- **Scryfall API** — card search, card data, and card images (served directly from CDN per ToS)

### Architecture
- Serverless API routes in `api/` handle card search, Moxfield import, EDHREC suggestions, and tournament scraping
- Cards table seeded from Scryfall bulk data (~100k English, non-digital cards with images); live API fallback on cache miss
- External data (EDHREC, EDHTop16, MTGTop8) cached in Supabase to avoid hammering third-party APIs
- No card image proxying — all images load directly from `cards.scryfall.io`

### Column Layout Algorithm
Cards are rendered in stacked columns (200px cards in 180px columns with 238px overlap). A `packColumns()` function determines how many type groups fit in the available container width, with a priority-based merge strategy: Artifact+Enchantment and Instant+Sorcery are considered for combining first (only if the merged column doesn't exceed the current tallest), then falling back to First Fit Decreasing bin-packing — tallest groups (e.g. Creatures, Lands) claim columns first so shorter groups fill the remaining space rather than fragmenting across columns. A `ResizeObserver`-based hook recalculates column count on container resize.

### Data Sources
| Source | Usage |
|---|---|
| Scryfall Bulk Data | Card database seed (~100k cards) |
| Scryfall API | Live card lookup fallback + import resolution |
| Moxfield API | Deck import (server-side fetch) |
| EDHREC JSON API | Commander card suggestions |
| EDHTop16 GraphQL API | cEDH tournament results |
| MTGTop8 (scraped) | Duel Commander tournament results |
