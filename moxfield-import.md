# Import from Moxfield

## Context

User wants to import decks from Moxfield by pasting a URL. Moxfield has an unofficial API at `api2.moxfield.com` that returns deck data including card `scryfall_id`s, quantities, and sections. The API is Cloudflare-protected (browser requests get 403'd), but server-side fetch from Vercel may work. We'll try the API approach and handle failure gracefully.

## Moxfield API Details

- **Endpoint**: `GET https://api2.moxfield.com/v2/decks/all/{deck_id}`
- **URL format**: `https://www.moxfield.com/decks/{deck_id}`
- **Response structure**: JSON with `name`, `format`, `description`, `publicId`, and section objects: `mainboard`, `sideboard`, `maybeboard`, `commanders`, `companions`
- Each section is a dict of `{ [cardName]: { quantity: number, card: { scryfall_id, name, ... } } }`
- Cards include `scryfall_id` (UUID) which maps directly to our `cards.scryfall_id` column

## Files to Create/Modify

### 1. Create `api/import/moxfield.ts` — new Vercel API route

`POST /api/import/moxfield` with body `{ url: string }`

- Extract deck ID from URL (regex: `/decks/([a-zA-Z0-9_-]+)`)
- Fetch `https://api2.moxfield.com/v2/decks/all/{id}` with a reasonable User-Agent header
- Parse response: extract deck metadata (name, format, description) and cards by section
- Map Moxfield sections → our section names:
  - `commanders` → `Commander`
  - `mainboard` → `Mainboard`
  - `sideboard` → `Sideboard`
  - `maybeboard` → `Maybeboard`
  - `companions` → `Companion`
- For each card: look up by `scryfall_id` in our cards table; if missing, upsert a row using data from the Moxfield response (name, scryfall_id, type_line, cmc, mana_cost, etc.) or fetch from Scryfall API as fallback
- Return: `{ deck: { name, format, description }, cards: [{ card_id, section, quantity }] }`

### 2. Modify `src/App.tsx` — update NewDeckPage

- Add a Moxfield URL input field above the DeckForm
- On submit: call `POST /api/import/moxfield` → on success, create the deck via `createDeck`, then add all cards via `addCardsToDeck`, then navigate to the deck edit page
- Show loading/error states during import

### 3. Modify `src/hooks/useDeck.ts` — add bulk card import

- Add `addCardsToDeck(deckId, cards: { cardId: string, section: string, quantity: number }[])` function that inserts multiple deck_cards rows in a single Supabase insert (instead of N individual calls)

## Section mapping detail

Moxfield formats → our format names (capitalize first letter):
```
standard → Standard, modern → Modern, commander → Commander,
pioneer → Pioneer, legacy → Legacy, vintage → Vintage,
pauper → Pauper
```

## Verification

1. `npm run build` — no errors
2. Paste a public Moxfield deck URL → deck created with correct name/format
3. All cards appear in correct sections with correct quantities
4. Cards not in cache get upserted
5. Error shown if URL is invalid or Moxfield API is unreachable
