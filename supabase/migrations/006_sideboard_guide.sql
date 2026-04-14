-- Sideboard guide: per-matchup card swap plans for 60-card formats

create table sideboard_guide_matchups (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references decks(id) on delete cascade not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table sideboard_guide_entries (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid references sideboard_guide_matchups(id) on delete cascade not null,
  card_name text not null,
  -- negative = take out from mainboard, positive = bring in from sideboard
  delta integer not null check (delta != 0),
  unique(matchup_id, card_name)
);

create index idx_sbg_matchups_deck on sideboard_guide_matchups(deck_id);
create index idx_sbg_entries_matchup on sideboard_guide_entries(matchup_id);

alter table sideboard_guide_matchups enable row level security;
alter table sideboard_guide_entries enable row level security;

-- Matchups: readable if deck is public or you own it
create policy "sbg_matchups_select" on sideboard_guide_matchups
  for select using (
    exists (
      select 1 from decks
      where id = deck_id
        and (is_public = true or auth.uid() = user_id)
    )
  );

-- Matchups: full write access for deck owner
create policy "sbg_matchups_all" on sideboard_guide_matchups
  for all using (
    auth.uid() = (select user_id from decks where id = deck_id)
  );

-- Entries: readable via matchup → deck
create policy "sbg_entries_select" on sideboard_guide_entries
  for select using (
    exists (
      select 1 from sideboard_guide_matchups m
      join decks d on d.id = m.deck_id
      where m.id = matchup_id
        and (d.is_public = true or auth.uid() = d.user_id)
    )
  );

-- Entries: full write access for deck owner
create policy "sbg_entries_all" on sideboard_guide_entries
  for all using (
    auth.uid() = (
      select d.user_id from sideboard_guide_matchups m
      join decks d on d.id = m.deck_id
      where m.id = matchup_id
    )
  );
