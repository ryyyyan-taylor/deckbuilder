-- EDHREC card recommendations cache (per commander)
create table edhrec_cache (
  id              uuid primary key default gen_random_uuid(),
  commander_name  text unique not null,
  data            jsonb not null,
  fetched_at      timestamptz default now()
);

-- Tournament results cache (per commander + source)
create table tournament_cache (
  id              uuid primary key default gen_random_uuid(),
  commander_name  text not null,
  source          text not null,
  data            jsonb not null,
  fetched_at      timestamptz default now(),
  unique(commander_name, source)
);

-- RLS: publicly readable
alter table edhrec_cache enable row level security;
alter table tournament_cache enable row level security;

create policy "edhrec_cache_select" on edhrec_cache for select using (true);
create policy "tournament_cache_select" on tournament_cache for select using (true);
