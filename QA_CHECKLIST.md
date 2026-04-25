# QA Checklist — Star Wars: Unlimited (SWU) Integration

This document tracks quality assurance for the complete MTG + SWU dual-game support.

## Phase 10 Checklist — Docs & QA

### Documentation ✅
- [x] Update `CLAUDE.md` with Games section (polymorphic schema, URL params, game toggle location, format/section handling, stats panel, seeding)
- [x] Update `API.md` with SWUDB endpoint docs and `?game=` param examples
- [x] Recreate `QA_CHECKLIST.md` with comprehensive SWU-specific test cases

### System Health
- [x] `npm run build` clean (zero TypeScript errors)
- [x] `npm run lint` clean
- [x] All phases (1–9) implemented and working
- [x] Git commits clean, no uncommitted changes

---

## Regression Testing — MTG (Smoke Test)

These tests verify MTG workflows still work unchanged after SWU integration.

### Dashboard
- [ ] Load `/decks` → defaults to MTG view
- [ ] MTG decks list populated (if user has created decks)
- [ ] Toggle to SWU → URL becomes `/decks?game=swu`, only SWU decks shown
- [ ] Toggle back to MTG → `/decks?game=mtg` or `/decks`, MTG decks shown
- [ ] Reload page without `?game=` param → defaults to MTG (or stored game from localStorage)
- [ ] Create new deck → navigate to `/decks/new`, defaults to MTG
- [ ] Format dropdown shows MTG formats: Standard, Modern, Pioneer, Legacy, Vintage, Commander, cEDH, Duel Commander, Pauper, Draft, Other

### Deck Editor (MTG)
- [ ] Open existing MTG deck → editor loads, sections are Mainboard, Sideboard, Stats, Test (Commander format adds Commander section)
- [ ] Card search returns MTG cards from Scryfall
- [ ] Add a card to Mainboard → card appears in section
- [ ] Mana curve stats render (8 cost buckets: 0–7+)
- [ ] Color pips render (W/U/B/R/G/C)
- [ ] Land production stats render
- [ ] Card type grouping works (Creature, Land, Instant, etc.)

### Moxfield Import (MTG)
- [ ] Open MTG deck → click Import in bulk edit mode
- [ ] Modal title: "Import from Moxfield"
- [ ] Paste valid Moxfield URL → deck populates with cards in correct sections
- [ ] Try invalid Moxfield URL → error "Not a valid Moxfield deck URL"
- [ ] Rate limit: 21 requests in 60s → 21st returns 429

### Deck Sandbox (MTG)
- [ ] Load `/sandbox?game=mtg` → MTG sandbox mode
- [ ] Default sections: Mainboard, Sideboard, Stats, Test
- [ ] Card search returns MTG cards
- [ ] Add cards → appear in sections
- [ ] Reset button clears all cards
- [ ] Reload page → state persists (soft F5)
- [ ] Hard refresh (Ctrl+Shift+R) → state cleared

### Deck Compare (MTG)
- [ ] Load `/compare?game=mtg` → MTG compare mode
- [ ] Default slot type: Moxfield URL
- [ ] Slot dropdown shows: "Saved Deck", "Moxfield URL", "Text"
- [ ] Add saved MTG deck to slot 0 → appears
- [ ] Add Moxfield URL to slot 1 → deck loads
- [ ] Compare shows Shared cards (in all slots) and Unique cards per slot
- [ ] Right-click any card in compare → context menu to add to slot 0 (if slot 0 is saved deck)
- [ ] Copy Section button → copies card names to clipboard

### Deck View (MTG)
- [ ] Open public MTG deck via `/deck/{id}` (no auth) → deck renders
- [ ] Sections, cards, stats all visible
- [ ] Game badge visible (should say "MTG")
- [ ] Share link works

### Suggestions & Results (MTG)
- [ ] Create Commander format deck with a commander card
- [ ] Suggestions button appears in header
- [ ] Click Suggestions → EDHREC modal loads with card suggestions
- [ ] cEDH format → Results button appears (EDHTop16)
- [ ] Duel Commander → Results button (MTGTop8)

---

## Happy Path Testing — SWU

These tests verify the core SWU user experience.

### Dashboard (SWU)
- [ ] Load `/decks` → toggle to SWU
- [ ] URL becomes `/decks?game=swu`
- [ ] Empty state: "No SWU decks yet — Create one"
- [ ] Format dropdown shows: Premier, Twin Suns
- [ ] Click "New Deck" from SWU view → navigate to `/decks/new?game=swu`

### Deck Creation (SWU)
- [ ] Create new SWU deck in Premier format
- [ ] Default sections: Leader/Base, Ground Units, Space Units, Events, Upgrades, Sideboard, Stats, Test
- [ ] All sections present in section bar
- [ ] Leader/Base, Stats, Test are protected (× button disabled or not present)
- [ ] Save deck → deck persists in DB with `game='swu'`
- [ ] Reopen deck → sections and `game='swu'` preserved

### Card Search (SWU)
- [ ] Open SWU deck editor
- [ ] Bulk edit mode: open CardSearch
- [ ] Search for "Luke" → returns SWU cards only (Luke Skywalker should appear)
- [ ] Add Luke Skywalker (Leader) → appears in Leader/Base section
- [ ] Search for "TIE Fighter" → returns SWU unit cards
- [ ] Add a Ground Unit → appears in Ground Units section
- [ ] Add a Space Unit → appears in Space Units section
- [ ] Add an Event → appears in Events section
- [ ] Add an Upgrade → appears in Upgrades section

### Leader/Base Mechanics (SWU)
- [ ] Add a Leader card to deck → appears in Leader/Base section
- [ ] Add another Leader → replaces the first
- [ ] Add a Base card → coexists with Leader in same section
- [ ] Add another Base → replaces the first Base (but Leader stays)
- [ ] Quantity cap: max 1 Leader + 1 Base at a time

### SWUDB Deck Import (SWU)
- [ ] Create SWU deck
- [ ] Click Import in bulk edit mode
- [ ] Modal title: "Import from SWUDB"
- [ ] Paste valid SWUDB URL → deck populates
- [ ] Cards automatically split into sections:
  - Leader → Leader/Base
  - Base → Leader/Base
  - Ground Unit → Ground Units
  - Space Unit → Space Units
  - Event → Events
  - Upgrade → Upgrades
  - Sideboard items → Sideboard
- [ ] Try invalid SWUDB URL → error "Not a valid SWUDB deck URL"
- [ ] Try Moxfield URL in SWU deck → validation error (URL format check)
- [ ] Rate limit: 21 requests in 60s → 21st returns 429

### Stats Panel (SWU)
- [ ] Add various SWU cards to deck
- [ ] Stats panel shows three sections:
  1. **Cost Curve** — bar chart with buckets 0–7+
  2. **Aspect Pips** — 6 colored circles: Vigilance, Command, Aggression, Cunning, Heroism, Villainy
  3. **Card Type Breakdown** — 2-column grid with Leader, Base, Ground Unit, Space Unit, Event, Upgrade, Other counts
- [ ] Add a card with cost=3 → cost curve bucket 3 increments
- [ ] Add a Leader with [Heroism, Command] aspects → both aspect counts increment
- [ ] Empty deck → shows "Add cards to your deck to see statistics"

### SWU Deck Sandbox
- [ ] Load `/sandbox?game=swu`
- [ ] Sandbox badge shows "Sandbox SWU"
- [ ] Default sections: Leader/Base, Ground Units, Space Units, Events, Upgrades, Sideboard, Stats, Test
- [ ] Card search returns SWU cards only
- [ ] Add Leader → appears in Leader/Base
- [ ] Reset button → clears all cards
- [ ] Reload page (F5) → state persists
- [ ] Hard refresh → state cleared

### SWU Deck Compare
- [ ] Load `/compare?game=swu`
- [ ] Slot type dropdown shows: "Saved Deck", "SWUDB URL", "Text"
- [ ] Add saved SWU deck to slot 0
- [ ] Add SWUDB URL to slot 1 → deck loads
- [ ] Compare shows: Shared cards (in all main sections) and Unique cards per slot
- [ ] Main sections: Ground Units, Space Units, Events, Upgrades (4 sections per SWU game rules)
- [ ] Leader/Base and Sideboard excluded from comparison
- [ ] Right-click card → add to slot 0 (if saved deck)
- [ ] Copy Section button → copies card names

### SWU Public Deck View
- [ ] Create and publish public SWU deck
- [ ] Open `/deck/{id}` without auth
- [ ] Game badge shows "SWU"
- [ ] Sections, cards, stats visible
- [ ] Stats panel shows cost curve, aspect pips, card types (not mana curve or land production)

---

## Edge Cases & Error Handling

### Cross-Game Rejection
- [ ] Try to paste Moxfield URL into SWU import modal → validation error
- [ ] Try to paste SWUDB URL into MTG import modal → validation error

### Stale Card ID Fallback
- [ ] Create SWUDB import with outdated card ID → fallback to card name lookup succeeds
- [ ] Fallback chain: DB lookup → SWUAPI by-ID → SWUAPI name search → error if all fail

### Empty Decks
- [ ] Create empty MTG deck → no stats rendering, empty message
- [ ] Create empty SWU deck → no cost curve/aspect pips/type breakdown, empty message

### API Error Handling
- [ ] `/api/cards/search?q=xyz&game=invalid` → defaults to MTG
- [ ] `/api/cards/search?q=x` (1 char) → validation error (min 2 chars)
- [ ] `/api/import/moxfield` with malformed JSON → 400 Bad Request
- [ ] `/api/import/swudb` with CORS origin mismatch → 403 Forbidden

### Session Isolation
- [ ] Open SWU sandbox in one tab, MTG sandbox in another → state isolated per game
- [ ] Switching `?game=` in URL with existing cards → cards cleared or state reset (depending on implementation)

---

## Performance & Load Testing

### Search Responsiveness
- [ ] MTG card search 500+ rows → responsive (<500ms)
- [ ] SWU card search 500+ rows → responsive (<500ms)

### Bulk Operations
- [ ] SWUDB import with 100-card deck → completes in <5s
- [ ] Compare view with 3 slots, 50+ cards each → renders smoothly

### Database Queries
- [ ] Card search query includes game filter (`.eq('game', ...)`)
- [ ] Deck list query includes game filter
- [ ] No N+1 queries on bulk import or compare

---

## Accessibility & UI Polish

### Game Toggle
- [ ] Game toggle buttons clearly labeled (MTG / SWU with icons)
- [ ] Keyboard navigation works (Tab to toggle, Enter/Space to select)
- [ ] Visual feedback on selected game (highlighted button)

### Empty States
- [ ] No MTG decks: "No MTG decks yet — Create one"
- [ ] No SWU decks: "No SWU decks yet — Create one"
- [ ] No search results: "No cards found for '[query]'" (per game)

### Mobile Responsiveness
- [ ] Game toggle visible and usable on mobile
- [ ] Deck list, editor, compare all responsive at 375px width
- [ ] No horizontal scroll on card sections

---

## Post-Deployment Verification

### Production (Vercel)
- [ ] Build succeeds: `npm run build` clean
- [ ] Deploy succeeds: no Vercel build errors
- [ ] Smoke test production URL:
  - [ ] `/decks` MTG view loads
  - [ ] Toggle to SWU works
  - [ ] Create new SWU deck works
  - [ ] SWUDB import works (real deck)
  - [ ] Public SWU deck view works

### Database
- [ ] Production Supabase has 8k+ SWU cards (run seeder if needed)
- [ ] MTG cards unaffected (row count ~100k)
- [ ] Game toggle queries are indexed (cards_game_idx, decks_game_idx exist)

### Monitoring
- [ ] `/api/health` returns `healthy`
- [ ] No errors in browser console on MTG or SWU workflows
- [ ] No rate-limit errors under normal usage

---

## Sign-Off

| Item | Owner | Status | Date |
|------|-------|--------|------|
| MTG Regression Tests | | | |
| SWU Happy Path | | | |
| Edge Cases | | | |
| Performance | | | |
| Production Deploy | | | |
| **Overall Readiness** | | | |

**Release Gate**: All rows checked ✅ before shipping to production.
