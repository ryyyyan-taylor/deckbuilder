-- Add sections array to decks table
ALTER TABLE decks ADD COLUMN sections text[] DEFAULT '{Mainboard}';

-- Backfill existing rows based on format
UPDATE decks
SET sections = CASE
  WHEN format = 'Commander' THEN '{Commander,Mainboard,Sideboard,Maybeboard}'::text[]
  ELSE '{Mainboard,Sideboard}'::text[]
END;
