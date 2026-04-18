-- Add play/draw split to sideboard guide entries
-- Replaces single delta column with delta_play and delta_draw

-- Step 1: add new columns (nullable)
alter table sideboard_guide_entries
  add column delta_play integer,
  add column delta_draw integer;

-- Step 2: migrate existing data — copy delta to both columns
update sideboard_guide_entries
  set delta_play = delta, delta_draw = delta;

-- Step 3: drop old column
alter table sideboard_guide_entries drop column delta;

-- Step 4: add constraints
alter table sideboard_guide_entries
  add constraint check_delta_play_nonzero check (delta_play is null or delta_play != 0),
  add constraint check_delta_draw_nonzero check (delta_draw is null or delta_draw != 0),
  add constraint check_at_least_one_delta check (delta_play is not null or delta_draw is not null);
