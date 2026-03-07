-- ============================================
-- 1. Tables
-- ============================================

-- Scryfall card cache (seeded from bulk data)
create table cards (
  id            uuid primary key default gen_random_uuid(),
  scryfall_id   text unique not null,
  name          text not null,
  mana_cost     text,
  cmc           numeric,
  type_line     text,
  colors        text[],
  color_identity text[],
  set_code      text,
  image_uris    jsonb,
  updated_at    timestamptz default now()
);

-- User decks
create table decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  format      text,
  description text,
  is_public   boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Cards within a deck
create table deck_cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid references decks(id) on delete cascade not null,
  card_id     uuid references cards(id) not null,
  section     text not null,
  quantity    integer default 1,
  created_at  timestamptz default now()
);

-- ============================================
-- 2. Indexes
-- ============================================

create index idx_cards_scryfall_id on cards(scryfall_id);
create index idx_cards_name on cards(name);
create index idx_decks_user_id on decks(user_id);
create index idx_deck_cards_deck_id on deck_cards(deck_id);

-- ============================================
-- 3. Row Level Security
-- ============================================

-- Cards: publicly readable, no user writes (seeded by service role)
alter table cards enable row level security;

create policy "Cards are publicly readable"
  on cards for select
  using (true);

-- Decks: owners have full CRUD, public decks readable by anyone
alter table decks enable row level security;

create policy "Users can create their own decks"
  on decks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own decks"
  on decks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own decks"
  on decks for delete
  using (auth.uid() = user_id);

create policy "Public decks are readable by anyone"
  on decks for select
  using (is_public = true);

create policy "Users can read their own decks"
  on decks for select
  using (auth.uid() = user_id);

-- Deck cards: follow deck ownership
alter table deck_cards enable row level security;

create policy "Users can manage cards in their own decks"
  on deck_cards for all
  using (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and decks.user_id = auth.uid()
    )
  );

create policy "Deck cards are readable for public decks"
  on deck_cards for select
  using (
    exists (
      select 1 from decks
      where decks.id = deck_cards.deck_id
      and decks.is_public = true
    )
  );
