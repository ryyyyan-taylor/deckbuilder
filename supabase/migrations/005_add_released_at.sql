-- Add released_at to cards so name lookups can prefer the earliest printing
alter table cards add column released_at date;
create index idx_cards_released_at on cards(released_at);
