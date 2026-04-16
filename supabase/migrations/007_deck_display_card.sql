-- Add display_card_id to decks for deck art on list pages and banners
ALTER TABLE decks ADD COLUMN display_card_id uuid REFERENCES cards(id) ON DELETE SET NULL;
CREATE INDEX idx_decks_display_card_id ON decks(display_card_id);
