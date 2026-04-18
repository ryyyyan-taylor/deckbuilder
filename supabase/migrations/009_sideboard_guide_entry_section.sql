-- Distinguish mainboard-out vs sideboard-in entries for the same card
-- when a card appears in both sections of a deck.

alter table sideboard_guide_entries
  add column is_out boolean not null default false;

-- Derive is_out from existing delta signs
update sideboard_guide_entries
  set is_out = true
  where (delta_play is not null and delta_play < 0)
     or (delta_draw  is not null and delta_draw  < 0);

-- Replace unique(matchup_id, card_name) with unique(matchup_id, card_name, is_out)
alter table sideboard_guide_entries
  drop constraint sideboard_guide_entries_matchup_id_card_name_key;

alter table sideboard_guide_entries
  add constraint sideboard_guide_entries_matchup_card_section_key
  unique (matchup_id, card_name, is_out);
