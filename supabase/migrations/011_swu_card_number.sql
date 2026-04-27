-- Add card_number column for SWU cards (used to build Karabast deck export IDs)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_number text;
