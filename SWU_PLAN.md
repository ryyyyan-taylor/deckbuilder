# Star Wars: Unlimited (SWU) Support — Implementation Plan

## Completion Status

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Schema + game constant | ✅ DONE | 2026-04-24 |
| 2 | SWU seeder + type helpers | ✅ DONE | 2026-04-24 |
| 3 | Game-aware card library | ✅ DONE | 2026-04-24 |
| 4 | Game-parameterized card API | ✅ DONE | 2026-04-24 |
| 5 | DeckForm + editor wiring | ✅ DONE | 2026-04-24 |
| 6 | Dashboard + public page toggle | ✅ DONE | 2026-04-24 |
| 7 | SWUDB deck import | ⏳ TODO | — |
| 8 | Stats panel (cost curve + aspect pips) | ⏳ TODO | — |
| 9 | Sandbox + compare gating | ⏳ TODO | — |
| 10 | Docs + QA | ⏳ TODO | — |

**Current state:** 6/10 phases complete. 8,071 SWU cards seeded. MTG flows fully backward-compatible. Game toggle on `/decks`, `/` (public), and utilities pages. Ready for SWUDB deck import.

## Context

The deckbuilder is currently MTG-only: Scryfall-seeded `cards` table with MTG-shaped columns (`mana_cost`, `cmc`, `type_line`, `colors`, `color_identity`), MTG-only UI (mana curve, color pips, Commander protection), Moxfield import. The user plays SWU too and wants the same experience for SWU decks: personal decks, public-shareable view per deck, deck editor, sandbox, compare, and SWUDB import. No tournament/suggestions for SWU.

Goal: abstract along a `game` dimension so MTG and SWU coexist without forking. One `cards` table, one `decks` table, with a game toggle at the top of the `/decks` dashboard and public decks page. Inside a specific deck, the game is inferred from `deck.game` — no global mode switch.

## Architecture decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Card storage | Single `cards` table with `game` column + nullable SWU columns | One query path; `deck_cards.card_id` FK stays simple; Postgres doesn't support true polymorphic FKs cleanly |
| Game toggle persistence | URL param `?game=swu` primary, `localStorage.preferredGame` default on fresh visit | Shareable/bookmarkable URLs; sticky default for returning users |
| Leader/Base sections | One combined protected section `"Leader/Base"`, max 1 Leader + 1 Base | User preference; adding 2nd of same `swu_type` replaces the first (mirrors Commander UX) |
| Sandbox / compare | Lock to one game per session via `?game=` URL param | User requested one-game-per-session; rejects cross-game mixing |
| Icons | Inline SVG (no icon library in `package.json`) | Avoid dependency; small segmented control icons |
| `scryfall_id` column name | Kept as-is; functions as external_id for SWU too | Renaming touches too much; SWUDB IDs won't collide with Scryfall UUIDs; composite unique `(scryfall_id, game)` makes it safe |
| Tournament/suggestions for SWU | Not implemented | Explicitly out of scope |

## SWUDB API — items to verify before Phase 2

These couldn't be confirmed during planning. Verify at start of Phase 2 by hitting the API once:

1. **Bulk card download** — Scryfall-bulk equivalent? If absent, seeder paginates `/cards` by set. SWU's ~1.5k card count makes either path fine.
2. **Batch collection endpoint** — Scryfall `/cards/collection` equivalent for importer? If absent, use parallel by-id fetches with concurrency cap (10 at a time).
3. **Deck JSON endpoint** — `api.swu-db.com/decks/{id}` or `swudb.com/deck/{id}?format=json`? Record the exact path and response shape.
4. **Aspect names** — assumed `['Vigilance','Command','Aggression','Cunning','Heroism','Villainy']`. Confirm field name (`aspects` plural, probably array of strings).
5. **Format names** — assumed `['Premier','Twin Suns']`. Confirm SWU official formats.
6. **Leader flip-side image** — how does the two-face art come back? Expect `front_art` + `back_art` or similar. Need it to survive into `image_uris` jsonb (mirror what Scryfall does with `card_faces[0].image_uris`).
7. **Rate limits / User-Agent** — note headers required; set `USER_AGENT` constant accordingly.

Capture findings inline in `api/_lib/swudb.ts` as comments at the top.

---

## Phase 1 — Schema + game constant — ✅ COMPLETED

**Goal**: Add `game` columns to `cards` and `decks`, add SWU-specific nullable columns, plus a `src/lib/games.ts` module with everything game-aware logic will lean on. Nothing in the app behavior changes yet — this is pure foundation.

**Status**: DONE. Migration 010 ran successfully on Supabase. All existing rows default to `game='mtg'`. Games module exports type, labels, icons, and all game-aware helper functions.

### Files

- NEW: `supabase/migrations/010_add_game_swu.sql`
- NEW: `src/lib/games.ts`

### Migration SQL

```sql
-- 010_add_game_swu.sql

-- cards: add game column + SWU-specific nullable columns
alter table cards
  add column game text not null default 'mtg',
  add column aspects text[],
  add column cost int,
  add column arena text,
  add column hp int,
  add column power int,
  add column swu_type text;

-- Relax unique(scryfall_id) to composite unique(scryfall_id, game)
alter table cards drop constraint cards_scryfall_id_key;
alter table cards add constraint cards_scryfall_id_game_key unique (scryfall_id, game);

create index cards_game_idx on cards(game);

-- decks: add game column
alter table decks
  add column game text not null default 'mtg';

create index decks_game_idx on decks(game);

-- Existing rows receive game='mtg' via default. Zero-touch backfill.
```

### `src/lib/games.ts` contract

```ts
export type Game = 'mtg' | 'swu'
export const GAMES: Game[] = ['mtg', 'swu']

export const GAME_LABELS: Record<Game, string> = { mtg: 'MTG', swu: 'SWU' }

// Small inline SVG components for segmented control
export const GameIconMtg: React.FC<{ className?: string }> = ...
export const GameIconSwu: React.FC<{ className?: string }> = ...

// Replace FORMATS constant from DeckForm.tsx:4-6
export function getFormats(game: Game): string[] {
  if (game === 'mtg') return ['Standard','Modern','Pioneer','Legacy','Vintage',
    'Commander','cEDH','Duel Commander','Pauper','Draft','Other']
  return ['Premier', 'Twin Suns']
}

// Replace getDefaultSections from DeckForm.tsx
export function getDefaultSections(game: Game, format: string): string[] {
  if (game === 'swu') {
    return ['Leader/Base', 'Ground Units', 'Space Units', 'Events', 'Upgrades', 'Sideboard', 'Stats', 'Test']
  }
  const commanderFormats = ['Commander', 'cEDH', 'Duel Commander']
  if (commanderFormats.includes(format)) {
    return ['Commander', 'Mainboard', 'Sideboard', 'Stats', 'Test']
  }
  return ['Mainboard', 'Sideboard', 'Stats', 'Test']
}

// Generalize PROTECTED_SECTIONS from EditDeckPage.tsx:102-109
export function getProtectedSections(game: Game, format: string): string[] {
  if (game === 'swu') return ['Leader/Base', 'Stats', 'Test']
  const base = ['Mainboard', 'Stats', 'Test']
  const commanderFormats = ['Commander', 'cEDH', 'Duel Commander']
  return commanderFormats.includes(format) ? [...base, 'Commander'] : base
}

// Used by ComparePage and StatsPanel to know which sections count as "the deck"
export function getMainSections(game: Game): string[] {
  if (game === 'swu') return ['Ground Units', 'Space Units', 'Events', 'Upgrades']
  return ['Mainboard']
}
```

### Implementation steps

1. Write migration file. Run `supabase migration up` (or whatever the project uses — see existing migrations for conventions).
2. Write `src/lib/games.ts` with the contracts above. Don't import it anywhere yet.
3. Do NOT yet change `DeckForm.tsx` or `EditDeckPage.tsx` — those move in Phase 5.

### Testing

- [ ] Run migration locally: confirm `cards.game` and `decks.game` exist with default `'mtg'`.
- [ ] `select count(*) from cards where game = 'mtg'` → matches total card count.
- [ ] `select count(*) from decks where game = 'mtg'` → matches total deck count.
- [ ] Try inserting a test card with `game='swu'` and same `scryfall_id` as an existing MTG row — should succeed (composite unique).
- [ ] Delete the test row.
- [ ] `npm run build` → clean (new module isn't wired in yet; import it in a scratch file to confirm types compile).
- [ ] `npm run lint` → clean.
- [ ] Load the app → MTG flows still work unchanged (smoke test `/decks`, deck editor, import).

### Rollback

If the migration breaks something:

```sql
alter table cards drop constraint cards_scryfall_id_game_key;
alter table cards add constraint cards_scryfall_id_key unique (scryfall_id);
alter table cards drop column game, drop column aspects, drop column cost,
  drop column arena, drop column hp, drop column power, drop column swu_type;
drop index cards_game_idx;

alter table decks drop column game;
drop index decks_game_idx;
```

---

## Phase 2 — SWU seeder + type helpers — ✅ COMPLETED

**Goal**: Populate the `cards` table with SWU card data and add SWU-specific type helpers. After this, SWU cards exist in the DB but no UI can see them yet.

**Status**: DONE. Seeded 8,071 SWU cards from SWUAPI (https://www.swuapi.com/export/all). All card fields correct (aspects, cost, arena, hp, power, swu_type, image_uris). Type helpers in `src/lib/swu.ts` with SWU_TYPE_ORDER and ASPECT_COLORS. SWUAPI client in `api/_lib/swudb.ts` with bulk fetch, search, and by-id lookup.

### Files

- NEW: `scripts/seed-swu.ts` ✅
- NEW: `src/lib/swu.ts` ✅
- NEW: `api/_lib/swudb.ts` ✅ (shared helpers used by both seeder and importer)

### SWUDB API verification

At the start of this phase, hit the SWUDB API and confirm the VERIFY items above. Document findings in a header comment in `api/_lib/swudb.ts`.

### `api/_lib/swudb.ts` contract

```ts
// SWUDB API findings (verified YYYY-MM-DD):
// - Base URL: https://api.swu-db.com
// - Bulk endpoint: /cards ... (verify)
// - Single card: /cards/{set}/{number}
// - Deck endpoint: ... (verify)
// - User-Agent required: yes/no
// - Rate limit: ...

export const SWUDB_BASE = 'https://api.swu-db.com'

export interface SwudbCard {
  Set: string
  Number: string
  Name: string
  Subtitle?: string
  Type: 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade'
  Aspects: string[]
  Arena?: 'Ground' | 'Space'
  Cost?: number
  Power?: number
  HP?: number
  FrontArt?: string
  BackArt?: string
  // ... (fill in from actual response shape)
}

export function swudbToRow(card: SwudbCard) {
  return {
    game: 'swu',
    scryfall_id: `${card.Set}_${card.Number}`, // SWU external id
    name: card.Subtitle ? `${card.Name}, ${card.Subtitle}` : card.Name,
    swu_type: card.Type,
    aspects: card.Aspects ?? [],
    cost: card.Cost ?? null,
    arena: card.Arena ?? null,
    hp: card.HP ?? null,
    power: card.Power ?? null,
    set_code: card.Set,
    type_line: card.Type, // keep type_line populated for generic code paths
    image_uris: pickSwudbImages(card),
    // Leave MTG columns null: mana_cost, cmc, colors, color_identity, oracle_text
  }
}

function pickSwudbImages(card: SwudbCard): Record<string, string> | null {
  // Mirror Scryfall's image_uris shape: { normal, large, art_crop, ... }
  // Confirm actual field names when verifying API
}

export async function fetchSwudbCard(id: string): Promise<SwudbCard | null> { ... }
export async function fetchSwudbCards(ids: string[]): Promise<SwudbCard[]> { ... }
export async function searchSwudbCards(query: string): Promise<SwudbCard[]> { ... }
```

### `scripts/seed-swu.ts` shape

Mirror `scripts/seed-cards.ts`:

1. Fetch bulk endpoint OR paginate `/cards` by set.
2. Filter for non-digital / English if applicable (probably N/A for SWU).
3. Transform each with `swudbToRow()`.
4. Batch upsert 500 at a time: `supabase.from('cards').upsert(rows, { onConflict: 'scryfall_id,game' })`.
5. Log progress.

Expected output: ~1.5k rows with `game='swu'` inserted.

### `src/lib/swu.ts` contract

```ts
export const SWU_TYPE_ORDER = ['Leader', 'Base', 'Ground Unit', 'Space Unit', 'Event', 'Upgrade', 'Other']

export const SWU_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy'] as const
export type SwuAspect = typeof SWU_ASPECTS[number]

// Color mapping for pip rendering — confirm hex values with SWU brand
export const ASPECT_COLORS: Record<SwuAspect, string> = {
  Vigilance: '#3b82f6',    // blue
  Command: '#16a34a',      // green
  Aggression: '#dc2626',   // red
  Cunning: '#eab308',      // yellow
  Heroism: '#f1f5f9',      // white/light
  Villainy: '#0f172a',     // black/dark
}

export interface SwuCardData {
  swu_type?: string | null
  arena?: string | null
  aspects?: string[] | null
  cost?: number | null
}

// Splits generic 'Unit' into 'Ground Unit' / 'Space Unit' based on arena
export function getSwuCardType(card: SwuCardData): string {
  const t = card.swu_type ?? 'Other'
  if (t === 'Unit') {
    if (card.arena === 'Ground') return 'Ground Unit'
    if (card.arena === 'Space') return 'Space Unit'
    return 'Unit'
  }
  return SWU_TYPE_ORDER.includes(t) ? t : 'Other'
}
```

### Testing

- [ ] `npx tsx scripts/seed-swu.ts` runs cleanly.
- [ ] `select count(*) from cards where game='swu'` returns ~1.5k.
- [ ] Spot-check a few rows: Luke Skywalker (leader), a Ground Unit, a Space Unit, an Event, an Upgrade, a Base. Confirm `aspects`, `cost`, `arena`, `hp`, `power` populated.
- [ ] Re-run seeder → upsert works, no duplicates (count unchanged).
- [ ] Manually query: `select name, swu_type, aspects, cost, arena, hp, power, image_uris from cards where game='swu' limit 5;` — verify image URLs load.
- [ ] `npm run build` clean.

---

## Phase 3 — Game-aware card library

**Goal**: Make the shared card helpers (`getCardType`, `TYPE_ORDER`, image URL builder) dispatch on `game`. No UI changes yet — just the library layer becomes game-aware. Every caller either passes game explicitly or keeps the MTG default.

### Files

- MODIFY: `src/lib/cards.ts`
- MODIFY: all callers of `getCardType` / `TYPE_ORDER` / `scryfallArtCropUrl`

### `src/lib/cards.ts` changes

Before:
```ts
export const TYPE_ORDER = ['Creature', 'Planeswalker', ..., 'Other']
export function getCardType(typeLine: string | null): string { ... MTG parsing ... }
export function scryfallArtCropUrl(scryfallId: string): string { ... }
```

After:
```ts
import { Game } from './games'
import { getSwuCardType, SWU_TYPE_ORDER } from './swu'

export const MTG_TYPE_ORDER = ['Creature', 'Planeswalker', ..., 'Other']
export const TYPE_ORDER = MTG_TYPE_ORDER  // backwards-compat export

export function getTypeOrder(game: Game = 'mtg'): string[] {
  return game === 'swu' ? SWU_TYPE_ORDER : MTG_TYPE_ORDER
}

// card shape is the full Card type (from useDeck) which now has swu_type/arena
export function getCardType(card: CardLike, game: Game = 'mtg'): string {
  if (game === 'swu') return getSwuCardType(card)
  return getMtgCardType(card.type_line ?? null)
}

function getMtgCardType(typeLine: string | null): string { ... existing MTG parsing ... }

// Image URL builders
export function scryfallArtCropUrl(scryfallId: string): string { ... unchanged ... }
export function swudbImageUrl(card: { image_uris?: any }): string { ... }
export function cardImageUrl(card: CardLike, game: Game, size: 'normal' | 'art_crop' = 'normal'): string {
  if (game === 'swu') return swudbImageUrl(card)
  return card.image_uris?.[size] ?? ''
}
```

Note: `getCardType`'s signature changes from `(typeLine: string | null)` to `(card: CardLike, game: Game)`. All callers must update.

### Callers to update

Use grep: `rg 'getCardType\(' src/` and `rg 'TYPE_ORDER' src/` and `rg 'scryfallArtCropUrl' src/`.

Known callers:
- `src/components/deck/DeckSection.tsx` (line ~89) — pass `deck.game` through props.
- `src/components/deck/EditDeckPage.tsx` — threads game to DeckSection and StatsPanel.
- `src/components/deck/ViewDeckPage.tsx` — same.
- `src/components/deck/SandboxPage.tsx` — reads game from sandbox state.
- `src/components/deck/StatsPanel.tsx` — gets game via prop.
- `src/components/deck/ComparePage.tsx` — reads game from `?game=` URL param.
- `src/components/deck/TestPanel.tsx` — gets game via prop.
- `src/components/cards/CardSearch.tsx` — gets game via prop from editor.

Pattern: add `game: Game` as a required prop to each component that renders cards; pass it down from the deck/route boundary.

### Testing

- [ ] `npm run build` clean after refactor (TS will catch missed callers).
- [ ] `npm run lint` clean.
- [ ] Open an existing MTG deck → sections still group correctly (Creature, Land, etc.).
- [ ] Mana curve and color pips in StatsPanel unchanged.
- [ ] Images still load on all card components.
- [ ] No regressions on compare, sandbox, view-deck, test-panel.

---

## Phase 4 — Game-parameterized card API

**Goal**: `/api/cards/search` and `/api/cards/[scryfall_id]` accept `?game=mtg|swu` and branch to the right external source on cache miss.

### Files

- MODIFY: `api/cards/search.ts`
- MODIFY: `api/cards/[scryfall_id].ts`
- MODIFY: `src/lib/validation.ts`
- NEW: `api/_lib/scryfall.ts` (extract existing MTG fetchers here)
- MODIFY: `api/_lib/swudb.ts` (extend from Phase 2 with search helpers)

### `src/lib/validation.ts` addition

```ts
export function validateGame(input: unknown): 'mtg' | 'swu' {
  if (input === 'swu') return 'swu'
  return 'mtg' // default
}
```

### `api/_lib/scryfall.ts` extraction

Move from `api/cards/search.ts` lines 35-48 and 86:
- `scryfallToRow(card): CardRow`
- `searchScryfall(query: string): Promise<ScryfallCard[]>`
- `fetchScryfallById(id: string): Promise<ScryfallCard | null>`
- `fetchScryfallByName(name: string): Promise<ScryfallCard | null>`
- `fetchScryfallCollection(ids: string[]): Promise<ScryfallCard[]>` (from moxfield.ts)

This centralizes Scryfall calls so the importer and both card endpoints share them.

### `api/cards/search.ts` rewrite

```ts
export default async function handler(req, res) {
  // ... existing CORS/rate-limit scaffolding unchanged ...
  const game = validateGame(req.query.game)
  const query = validateQuery(req.query.q) // existing
  
  // Cache check — add game filter
  const { data: cached } = await supabase
    .from('cards')
    .select('*')
    .ilike('name', `%${query}%`)
    .eq('game', game)
    .limit(20)
  
  if (cached && cached.length > 0) return res.json({ cards: cached })
  
  // Miss: branch by game
  const cards = game === 'swu'
    ? await searchSwudbCards(query)
    : await searchScryfall(query)
  
  const rows = game === 'swu'
    ? cards.map(swudbToRow)
    : cards.map(scryfallToRow)
  
  await supabase.from('cards').upsert(rows, { onConflict: 'scryfall_id,game' })
  return res.json({ cards: rows })
}
```

### `api/cards/[scryfall_id].ts` rewrite

Same pattern: accept `?game=`, branch on cache miss. The URL shape stays `/api/cards/{id}` — the `id` is `scryfall_id` for MTG or SWUDB id (e.g. `SOR_001`) for SWU.

### Frontend callers

Every frontend `fetch('/api/cards/search?q=...')` needs to pass `game`. Find them:

```
rg "/api/cards/" src/
```

Known callers: `CardSearch.tsx`, `ComparePage.tsx` (for card preview lookups). They should use `deck.game` / session game / URL param.

### Testing

- [ ] `curl 'http://localhost:3000/api/cards/search?q=lightning&game=mtg'` → MTG Lightning Bolt etc.
- [ ] `curl 'http://localhost:3000/api/cards/search?q=luke&game=swu'` → Luke Skywalker SWU leader.
- [ ] No `?game=` defaults to MTG (backwards compat).
- [ ] Rate-limit responses still correct.
- [ ] CORS headers still present.
- [ ] MTG deck editor card search still works end-to-end in browser.

---

## Phase 5 — DeckForm + EditDeckPage wiring

**Goal**: Creating a deck respects the current game. Opening a deck uses `deck.game` to drive protected sections, search endpoint, and card rendering.

### Files

- MODIFY: `src/components/deck/DeckForm.tsx`
- MODIFY: `src/components/deck/EditDeckPage.tsx`
- MODIFY: `src/hooks/useDeck.ts` (add `game` to Deck/Card types)

### `useDeck.ts` Deck interface

```ts
export interface Deck {
  id: string
  user_id: string
  name: string
  format: string | null
  game: 'mtg' | 'swu'  // NEW
  description: string | null
  is_public: boolean
  sections: string[] | null
  display_card_id: string | null
  created_at: string
  updated_at: string
}

export interface Card {
  // ... existing MTG fields ...
  game: 'mtg' | 'swu'  // NEW
  aspects?: string[] | null
  cost?: number | null
  arena?: string | null
  hp?: number | null
  power?: number | null
  swu_type?: string | null
}
```

### `DeckForm.tsx` changes

- Remove local `FORMATS` constant (lines 4-6) — use `getFormats(game)` from `src/lib/games.ts`.
- Remove local `getDefaultSections()` — use the one from `games.ts`.
- Accept `game: Game` prop. Write `game` to the `decks` insert.
- Format dropdown rendering: loops over `getFormats(game)`.

### `EditDeckPage.tsx` changes

- Remove hardcoded `commanderFormats` and `PROTECTED_SECTIONS` from lines 102-109.
- Replace with: `const protectedSections = getProtectedSections(deck.game, deck.format ?? '')`.
- Default sections on first load: `deck.sections ?? getDefaultSections(deck.game, deck.format ?? '')`.
- Pass `deck.game` as prop to: `CardSearch`, `DeckSection`, `StatsPanel`, `TestPanel`.
- Import modal text: "Paste Moxfield URL" when `mtg`, "Paste SWUDB URL" when `swu`.

### Leader/Base quantity cap

In `EditDeckPage.tsx`'s `addCardToDeck` function (or wherever Commander-cap logic lives):

```ts
// Existing Commander cap: 1 card max in Commander section
// NEW: Leader/Base cap for SWU — 1 Leader + 1 Base max
if (deck.game === 'swu' && section === 'Leader/Base') {
  const cardType = getSwuCardType(card)  // 'Leader' or 'Base'
  const existing = deckCards.find(dc =>
    dc.section === 'Leader/Base' && getSwuCardType(dc.card) === cardType
  )
  if (existing) {
    // Replace existing card of same swu_type (delete old, insert new)
    await removeCardFromDeck(existing.id)
  }
}
```

### Testing

- [ ] Create a new MTG deck via `/decks/new` → still works, default sections correct.
- [ ] Commander deck → Commander section protected, can't rename/delete.
- [ ] Create a new deck via `/decks/new?game=swu` → format dropdown shows Premier, Twin Suns. Default sections are Leader/Base + Ground Units + Space Units + Events + Upgrades + Sideboard + Stats + Test.
- [ ] SWU deck editor: Leader/Base section protected.
- [ ] Add a Leader card → appears in Leader/Base. Add a 2nd Leader → replaces first.
- [ ] Add a Base → coexists with Leader in same section.
- [ ] Add a 2nd Base → replaces first Base but Leader stays.
- [ ] MTG Commander cap still works.

---

## Phase 6 — Dashboard + public page toggle

**Goal**: Users can switch between MTG and SWU views on `/decks` and the public decks page. Selection persists via URL + localStorage.

### Files

- MODIFY: `src/components/deck/DeckList.tsx`
- MODIFY: `src/components/deck/PublicDecksPage.tsx`
- NEW: `src/components/GameToggle.tsx` (shared segmented control)

### `GameToggle.tsx` contract

```tsx
import { useSearchParams } from 'react-router-dom'
import { Game, GAME_LABELS, GameIconMtg, GameIconSwu } from '@/lib/games'

interface Props {
  onChange?: (game: Game) => void  // optional side-effect
}

export function GameToggle({ onChange }: Props) {
  const [params, setParams] = useSearchParams()
  const urlGame = params.get('game') as Game | null
  const storedGame = (localStorage.getItem('preferredGame') as Game) || 'mtg'
  const game: Game = urlGame ?? storedGame

  const select = (g: Game) => {
    const next = new URLSearchParams(params)
    next.set('game', g)
    setParams(next)
    localStorage.setItem('preferredGame', g)
    onChange?.(g)
  }

  return (
    <div className="flex items-center bg-gray-800 border border-gray-700 rounded text-sm">
      <button onClick={() => select('mtg')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l ${game === 'mtg' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
        <GameIconMtg className="w-4 h-4" /> MTG
      </button>
      <button onClick={() => select('swu')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-r ${game === 'swu' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
        <GameIconSwu className="w-4 h-4" /> SWU
      </button>
    </div>
  )
}

// Helper hook for reading the current game off the URL+storage
export function useSelectedGame(): Game {
  const [params] = useSearchParams()
  const urlGame = params.get('game') as Game | null
  if (urlGame === 'mtg' || urlGame === 'swu') return urlGame
  const stored = localStorage.getItem('preferredGame') as Game | null
  return stored === 'swu' ? 'swu' : 'mtg'
}
```

Uses existing segmented-control styling from `ViewDeckPage.tsx:154-181`.

### `DeckList.tsx` changes

- Render `<GameToggle />` near the "New Deck" button (top of page, line ~55-62).
- Read game via `useSelectedGame()` hook.
- Supabase query: `.eq('game', game)`.
- Format folders: `getFormats(game)` drives the folder list.
- "New Deck" button: navigate to `/decks/new?game={game}`.

### `PublicDecksPage.tsx` changes

- `<GameToggle />` in the header (line ~131).
- Supabase public-decks query: `.eq('game', game)`.

### `/decks/new` route

In whatever component owns this route (probably `DeckForm` page), read `?game=` from URL and pass to `DeckForm` as prop.

### Testing

- [ ] Load `/decks` → MTG view by default. Toggle to SWU → URL becomes `/decks?game=swu`, only SWU decks shown, format folders change.
- [ ] Reload page with `?game=swu` → still SWU.
- [ ] Clear localStorage + cookies, visit `/decks` with no param → defaults to MTG.
- [ ] Toggle SWU, reload without param → defaults to SWU (localStorage sticky).
- [ ] Click "New Deck" from SWU view → lands on `/decks/new?game=swu`, form shows SWU formats.
- [ ] Same for public decks page.

---

## Phase 7 — SWUDB deck import

**Goal**: User can paste an SWUDB deck URL into an SWU deck's import modal and have the deck populated with cards.

### Files

- NEW: `api/import/swudb.ts`
- MODIFY: `src/lib/validation.ts` — add `validateSwudbUrl`
- MODIFY: `api/_lib/rateLimit.ts` — add `IMPORT_SWUDB` entry
- MODIFY: `src/components/deck/EditDeckPage.tsx` — import modal game-aware
- MODIFY: `src/components/deck/SandboxPage.tsx` — same

### `validateSwudbUrl` contract

```ts
// Model after validateMoxfieldUrl at src/lib/validation.ts:46-72
const SWUDB_URL_RE = /^https?:\/\/(www\.)?swudb\.com\/deck\/([a-zA-Z0-9_-]+)$/

export function validateSwudbUrl(raw: string): { deckId: string } {
  if (typeof raw !== 'string' || raw.length > 200) throw new ValidationError('Invalid URL')
  const match = raw.match(SWUDB_URL_RE)
  if (!match) throw new ValidationError('Not a valid SWUDB deck URL')
  return { deckId: match[2] }
}
```

Confirm URL shape when verifying SWUDB API (Phase 2 prep).

### `api/import/swudb.ts` structure

Clone `api/import/moxfield.ts` almost verbatim, swapping:

1. `validateMoxfieldUrl` → `validateSwudbUrl`
2. Moxfield fetch → SWUDB fetch via `api/_lib/swudb.ts`
3. `SECTION_MAP` adapted:
   ```ts
   const SECTION_MAP = {
     leader: 'Leader/Base',
     base: 'Leader/Base',
     // Main deck entries are split by swu_type AFTER card resolution
     sideboard: 'Sideboard',
   }
   ```
4. Scryfall calls → SWUDB calls.
5. Card row insert uses `swudbToRow()` instead of `scryfallToRow()`. Upsert `onConflict: 'scryfall_id,game'`.
6. Stale-ID fallback: DB name lookup filtered `.eq('game', 'swu')` → SWUDB name lookup.
7. **Main-deck splitting**: after card resolution, iterate over main-deck entries. For each card, assign `section` based on `getSwuCardType(card)`:
   - `'Ground Unit'` → `'Ground Units'`
   - `'Space Unit'` → `'Space Units'`
   - `'Event'` → `'Events'`
   - `'Upgrade'` → `'Upgrades'`
8. Response shape: `{ name, cards, sections, game: 'swu' }`.

### Rate limit entry

In `api/_lib/rateLimit.ts`:

```ts
export const RATE_LIMITS = {
  // ... existing ...
  IMPORT_SWUDB: { limit: 20, window: 60 * 1000 },
}
```

### Frontend import modal

In `EditDeckPage.tsx` (and `SandboxPage.tsx` mirror):

```tsx
const importEndpoint = deck.game === 'swu' ? '/api/import/swudb' : '/api/import/moxfield'
const placeholder = deck.game === 'swu' ? 'https://swudb.com/deck/...' : 'https://moxfield.com/decks/...'
const label = deck.game === 'swu' ? 'SWUDB URL' : 'Moxfield URL'
```

### Testing

- [ ] `curl -X POST http://localhost:3000/api/import/swudb -H 'Content-Type: application/json' -d '{"url":"https://swudb.com/deck/REAL_ID"}'` — returns deck name + cards + sections.
- [ ] Deck has correct card distribution: Leader + Base in `Leader/Base`, units split by arena.
- [ ] Stale SWU card IDs: try an import with an out-of-date card id → falls back to name lookup successfully.
- [ ] Rate limit: 21 requests in 60s → 21st returns 429.
- [ ] In browser: create SWU deck → open import modal → paste SWUDB URL → deck populates.
- [ ] Moxfield import on MTG deck still works unchanged.
- [ ] Try pasting an SWUDB URL into an MTG deck's import → validation rejects.

---

## Phase 8 — Stats panel (cost curve + aspect pips)

**Goal**: StatsPanel renders SWU-appropriate stats when `deck.game === 'swu'`.

### Files

- MODIFY: `src/components/deck/StatsPanel.tsx`

### Strategy

Extract the existing MTG-specific parts into a new internal `StatsPanelMtg` component, add a new `StatsPanelSwu` component, and branch at the top of `StatsPanel`.

```tsx
export function StatsPanel({ deck, deckCards }: Props) {
  if (deck.game === 'swu') return <StatsPanelSwu deck={deck} deckCards={deckCards} />
  return <StatsPanelMtg deck={deck} deckCards={deckCards} />
}
```

### `StatsPanelSwu`

- **Cost curve**: buckets `0, 1, 2, 3, 4, 5, 6, 7+` keyed on `card.cost`. Reuse Recharts `BarChart` scaffold from MTG version (lines 206-224).
- **Aspect pips**: count appearances of each aspect across all cards in "main" sections (from `getMainSections('swu')`). Render using the same pip-row layout as MTG colors. Use `ASPECT_COLORS` from `src/lib/swu.ts`.
- **Card type breakdown**: Leader/Base/Ground Unit/Space Unit/Event/Upgrade counts — reuse generic `getCardType(card, 'swu')` grouping.
- **No land production section** (SWU has no land equivalent).

### Testing

- [ ] Open an MTG deck → stats unchanged (mana curve, color pips, land production).
- [ ] Open an SWU deck → stats shows cost curve, aspect pips, card type breakdown. No land production.
- [ ] Cost buckets correct (count a card with cost=3, verify bucket 3 increments).
- [ ] Aspect pips: leader with `['Heroism','Command']` contributes to both.
- [ ] Empty SWU deck → no errors, empty charts.

---

## Phase 9 — Sandbox + compare gating

**Goal**: Sandbox and compare respect one-game-per-session via `?game=` URL param.

### Files

- MODIFY: `src/components/deck/SandboxPage.tsx`
- MODIFY: `src/hooks/useSandboxDeck.ts`
- MODIFY: `src/components/deck/ComparePage.tsx`

### Sandbox

- `useSandboxDeck(game: Game)` accepts game; stores it in sessionStorage alongside deck state.
- `SandboxPage` reads `?game=` on mount. Default sections from `getDefaultSections(game, 'Sandbox')` (or whatever format token sandbox uses). Sandbox badge in header shows game label.
- Once a sandbox has cards, changing `?game=` should reset (since cards from a prior game don't apply).
- Card search: pass game so `/api/cards/search?game={game}` filters to the right pool.
- Import modal: same game-aware URL field as Phase 7.

### Compare

- `ComparePage` reads `?game=` once on mount. All slots lock to that game.
- Slot type dropdown "Saved Deck / Moxfield URL / Text" becomes "Saved Deck / Moxfield URL / Text" when MTG, "Saved Deck / SWUDB URL / Text" when SWU.
- Saved-deck combobox queries filtered `.eq('game', sessionGame)`.
- `MAIN_SECTIONS` → `getMainSections(game)`. For SWU this is 4 sections; comparison logic iterates over all of them instead of just 'Mainboard'.
- Card name normalization (strip ` // `) stays unchanged — works for SWU leader flips.
- `getCardType`/`TYPE_ORDER` calls pass session game.

### Entry points

- `/decks` page "Utilities" tab: "Deck Sandbox" link becomes `/sandbox?game={selectedGame}`.
- "Compare Decks" link becomes `/compare?game={selectedGame}`.
- Deck editor's "Compare" button: `/compare?deck={id}&game={deck.game}`.

### Testing

- [ ] `/sandbox?game=mtg` → MTG sandbox. Search returns MTG cards. Default sections are MTG.
- [ ] `/sandbox?game=swu` → SWU sandbox. Search returns SWU cards only. Default sections are Leader/Base etc.
- [ ] Changing game in sandbox URL resets cards (or shows confirm prompt).
- [ ] `/compare?game=swu` → only SWU saved decks appear in combobox. Slot URL type labeled "SWUDB URL".
- [ ] Pasting a Moxfield URL in SWU compare → rejected.
- [ ] Cross-game regression: MTG compare still works.

---

## Phase 10 — Docs, polish, deploy

**Goal**: Update docs, make sure empty states are sensible, seed production DB, deploy.

### Files

- MODIFY: `CLAUDE.md` — add "Games" section describing polymorphic schema, URL param convention, `src/lib/games.ts` / `src/lib/swu.ts`, game toggle location.
- MODIFY: `QA_CHECKLIST.md` — SWU-specific checks (seeder, import endpoint rate limit, validation).
- MODIFY: `API.md` — document `?game=` param on card endpoints, `/api/import/swudb` endpoint.
- MODIFY: `README.md` if it mentions MTG-only scope.

### Empty states

- First SWU deck list visit with no SWU decks yet → "No SWU decks yet — Create one".
- SWU card search on empty DB → "No cards found. Run the SWU seeder." (only shows pre-seed; production DB should be seeded before launch).

### Production seed

- Run `npx tsx scripts/seed-swu.ts` against production Supabase (use service role key).
- Verify row count.

### Deploy

- Merge to main → Vercel auto-deploys.
- Smoke-test production: create SWU deck, import, public share.

---

## Critical files index

**Schema & data**
- `supabase/migrations/010_add_game_swu.sql` (NEW)
- `scripts/seed-swu.ts` (NEW)

**Shared libraries**
- `src/lib/games.ts` (NEW) — `Game` type, `getFormats`, `getDefaultSections`, `getProtectedSections`, `getMainSections`, icons
- `src/lib/swu.ts` (NEW) — SWU type helpers, aspect constants, colors
- `src/lib/cards.ts` (MODIFY) — `getCardType(card, game)`, `getTypeOrder(game)`, `cardImageUrl(card, game)`
- `src/lib/validation.ts` (MODIFY) — `validateGame`, `validateSwudbUrl`

**API**
- `api/_lib/scryfall.ts` (NEW) — extracted Scryfall helpers
- `api/_lib/swudb.ts` (NEW) — SWUDB API client
- `api/_lib/rateLimit.ts` (MODIFY) — add `IMPORT_SWUDB`
- `api/cards/search.ts` (MODIFY) — accept `?game=`, branch
- `api/cards/[scryfall_id].ts` (MODIFY) — accept `?game=`, branch
- `api/import/swudb.ts` (NEW)

**Hooks & types**
- `src/hooks/useDeck.ts` (MODIFY) — add `game` to Deck/Card types
- `src/hooks/useSandboxDeck.ts` (MODIFY) — take `game` parameter

**Components**
- `src/components/GameToggle.tsx` (NEW) + `useSelectedGame()` hook
- `src/components/deck/DeckForm.tsx` (MODIFY) — game-aware formats + sections
- `src/components/deck/DeckList.tsx` (MODIFY) — game toggle + filter
- `src/components/deck/PublicDecksPage.tsx` (MODIFY) — game toggle + filter
- `src/components/deck/EditDeckPage.tsx` (MODIFY) — protected sections + Leader/Base cap + import
- `src/components/deck/SandboxPage.tsx` (MODIFY) — game-aware
- `src/components/deck/ComparePage.tsx` (MODIFY) — session game lock, main sections
- `src/components/deck/ViewDeckPage.tsx` (MODIFY) — pass game through
- `src/components/deck/DeckSection.tsx` (MODIFY) — accept game prop
- `src/components/deck/StatsPanel.tsx` (MODIFY) — branch MTG/SWU
- `src/components/deck/TestPanel.tsx` (MODIFY) — accept game prop
- `src/components/cards/CardSearch.tsx` (MODIFY) — accept game prop

**Docs**
- `CLAUDE.md`, `QA_CHECKLIST.md`, `API.md`, `README.md`

## Reuse inventory

Patterns to copy instead of reinvent:

| Need | Reuse from |
|---|---|
| Segmented control (game toggle) | `src/components/deck/ViewDeckPage.tsx:154-181` |
| Format filter pills | `src/components/deck/DeckList.tsx:121-143` |
| Import endpoint structure | `api/import/moxfield.ts` (entire file template) |
| Stale-ID fallback | `api/import/moxfield.ts:227-265` |
| Rate limiting | `api/_lib/rateLimit.ts` — `checkRateLimit()` |
| CORS / origin verification | `api/_lib/cors.ts` |
| Commander-style quantity cap | Existing Commander cap in `EditDeckPage.tsx` |
| `packColumns()` / column layout | `src/lib/cards.ts` — game-neutral, unchanged |
| Toast notifications | `src/components/Toast.tsx` |
| DnD section reordering | `@dnd-kit/sortable` setup in `EditDeckPage.tsx` — game-neutral |

## End-to-end verification (post-Phase 10)

Run through this before declaring done:

### MTG regression
- [ ] `/decks` shows only MTG decks by default.
- [ ] Create new MTG deck (Standard, Commander) → works as before.
- [ ] Open existing MTG deck → editor, sections, stats all unchanged.
- [ ] MTG card search returns Scryfall results.
- [ ] Moxfield import still works.
- [ ] MTG compare works across saved + Moxfield + text slots.
- [ ] MTG sandbox works.
- [ ] Public MTG deck view renders without auth.
- [ ] Stats panel shows mana curve + color pips + land production.

### SWU happy path
- [ ] Toggle to SWU on `/decks` → URL updates, shows SWU decks (empty first time).
- [ ] Create new SWU deck (Premier) → format dropdown shows Premier + Twin Suns.
- [ ] Default sections: Leader/Base, Ground Units, Space Units, Events, Upgrades, Sideboard, Stats, Test.
- [ ] Add a Leader → appears in Leader/Base.
- [ ] Add another Leader → replaces first.
- [ ] Add a Base → coexists with Leader in Leader/Base section.
- [ ] Card search returns SWU cards only.
- [ ] Import from SWUDB URL → deck populated, cards split into correct sections.
- [ ] Stats panel shows cost curve + aspect pips.
- [ ] Share publicly → `/deck/:id` renders SWU deck without auth, game badge visible.
- [ ] Sandbox with `?game=swu` locks to SWU.
- [ ] Compare with `?game=swu` filters decks.

### Cross-cutting
- [ ] Toggle state survives reload (URL param).
- [ ] Toggle state sticky via localStorage on fresh visit without param.
- [ ] Deck editor URL never needs `?game=` — uses `deck.game` directly.
- [ ] `npm run build` clean.
- [ ] `npm run lint` clean.
- [ ] CI green.

## Rollback plan

If a phase ships and causes production issues:

- Phase 1 migration: rollback SQL in Phase 1 section.
- Phases 2-10: revert PR. Feature flag not needed — each phase is additive and MTG paths keep working because `game` defaults to `'mtg'`.

Per-phase commits are preferred over one mega-PR — lets us bisect if something breaks later.
