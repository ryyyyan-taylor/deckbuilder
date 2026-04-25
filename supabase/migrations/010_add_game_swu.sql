-- ============================================
-- 010 — Add game dimension + SWU support
-- ============================================

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
-- This allows SWUDB cards and MTG cards to reuse the same scryfall_id column
-- (it functions as external_id for both systems)
alter table cards drop constraint cards_scryfall_id_key;
alter table cards add constraint cards_scryfall_id_game_key unique (scryfall_id, game);

create index cards_game_idx on cards(game);

-- decks: add game column
alter table decks
  add column game text not null default 'mtg';

create index decks_game_idx on decks(game);

-- Existing rows receive game='mtg' via default. Zero-touch backfill.
