import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface Card {
  id: string
  scryfall_id: string
  name: string
  game: 'mtg' | 'swu'
  mana_cost: string | null
  cmc: number | null
  type_line: string | null
  colors: string[]
  color_identity: string[]
  set_code: string | null
  oracle_text: string | null
  image_uris: { small?: string; normal: string; large?: string; png?: string; art_crop?: string; back?: string } | null
  // SWU-specific
  aspects?: string[] | null
  cost?: number | null
  arena?: string | null
  hp?: number | null
  power?: number | null
  swu_type?: string | null
  card_number?: string | null
}

export interface DeckCard {
  id: string
  deck_id: string
  card_id: string
  section: string
  quantity: number
  card?: Card
}

export interface Deck {
  id: string
  user_id: string
  name: string
  format: string | null
  game: 'mtg' | 'swu'
  description: string | null
  is_public: boolean
  sections: string[]
  created_at: string
  updated_at: string
  display_card_id: string | null
  display_card?: { scryfall_id?: string; image_uris: { art_crop?: string; normal?: string } | null } | null
}

export interface DeckInput {
  name: string
  format: string
  description: string
  is_public: boolean
  game?: 'mtg' | 'swu'
  sections?: string[]
  display_card_id?: string | null
}

export function useDeck() {
  const { user } = useAuth()
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDecks = async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('decks')
      .select('*, display_card:cards!display_card_id(scryfall_id, image_uris)')
      .order('updated_at', { ascending: false })
    setLoading(false)
    if (error) {
      setError(error.message)
      return []
    }
    // Normalize display_card: Supabase may return it as an array for FK joins
    const decksData = ((data ?? []) as Record<string, unknown>[]).map((d) => ({
      ...d,
      display_card: Array.isArray(d.display_card) ? (d.display_card[0] ?? null) : d.display_card,
    })) as Deck[]
    setDecks(decksData)
    return decksData
  }

  const fetchDeck = async (id: string) => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .eq('id', id)
      .single()
    setLoading(false)
    if (error) {
      setError(error.message)
      return null
    }
    return data as Deck
  }

  const createDeck = async (input: DeckInput) => {
    setError(null)
    const { data, error } = await supabase
      .from('decks')
      .insert({ ...input, user_id: user!.id })
      .select()
      .single()
    if (error) {
      setError(error.message)
      return null
    }
    return data as Deck
  }

  const updateDeck = async (id: string, fields: Partial<DeckInput>) => {
    setError(null)
    const { data, error } = await supabase
      .from('decks')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) {
      setError(error.message)
      return null
    }
    return data as Deck
  }

  const deleteDeck = async (id: string) => {
    setError(null)
    const { error } = await supabase
      .from('decks')
      .delete()
      .eq('id', id)
    if (error) {
      setError(error.message)
      return false
    }
    setDecks((prev) => prev.filter((d) => d.id !== id))
    return true
  }

  const addCardToDeck = async (deckId: string, cardId: string, section: string) => {
    setError(null)
    // Check if card already exists in this section
    const { data: existing } = await supabase
      .from('deck_cards')
      .select('id, quantity')
      .eq('deck_id', deckId)
      .eq('card_id', cardId)
      .eq('section', section)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('deck_cards')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id)
      if (error) {
        setError(error.message)
        return false
      }
    } else {
      const { error } = await supabase
        .from('deck_cards')
        .insert({ deck_id: deckId, card_id: cardId, section })
      if (error) {
        setError(error.message)
        return false
      }
    }
    return true
  }

  const updateDeckCardSection = async (deckCardId: string, newSection: string) => {
    setError(null)
    const { error } = await supabase
      .from('deck_cards')
      .update({ section: newSection })
      .eq('id', deckCardId)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  const updateDeckCardQuantity = async (deckCardId: string, quantity: number) => {
    setError(null)
    if (quantity <= 0) {
      return removeDeckCard(deckCardId)
    }
    const { error } = await supabase
      .from('deck_cards')
      .update({ quantity })
      .eq('id', deckCardId)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  const removeDeckCard = async (deckCardId: string) => {
    setError(null)
    const { error } = await supabase
      .from('deck_cards')
      .delete()
      .eq('id', deckCardId)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  const fetchDeckCards = async (deckId: string) => {
    setError(null)
    const { data, error } = await supabase
      .from('deck_cards')
      .select('*, card:cards(*)')
      .eq('deck_id', deckId)
    if (error) {
      setError(error.message)
      return []
    }
    return (data ?? []).map((dc: Record<string, unknown>) => ({
      ...dc,
      card: dc.card as Card,
    })) as DeckCard[]
  }

  const renameDeckCardSection = async (deckId: string, oldSection: string, newSection: string) => {
    setError(null)
    const { error } = await supabase
      .from('deck_cards')
      .update({ section: newSection })
      .eq('deck_id', deckId)
      .eq('section', oldSection)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  const bulkAddCards = async (deckId: string, cards: { card_id: string; section: string; quantity: number }[]) => {
    setError(null)
    const rows = cards.map((c) => ({
      deck_id: deckId,
      card_id: c.card_id,
      section: c.section,
      quantity: c.quantity,
    }))
    const { error } = await supabase.from('deck_cards').insert(rows)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  const updateDeckCardVersion = async (deckCardId: string, newCardId: string) => {
    setError(null)
    const { error } = await supabase
      .from('deck_cards')
      .update({ card_id: newCardId })
      .eq('id', deckCardId)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  const moveDeckCardsToSection = async (deckId: string, fromSection: string, toSection: string) => {
    setError(null)
    const { error } = await supabase
      .from('deck_cards')
      .update({ section: toSection })
      .eq('deck_id', deckId)
      .eq('section', fromSection)
    if (error) {
      setError(error.message)
      return false
    }
    return true
  }

  return {
    decks, loading, error,
    fetchDecks, fetchDeck, createDeck, updateDeck, deleteDeck,
    addCardToDeck, fetchDeckCards,
    updateDeckCardSection, updateDeckCardQuantity, removeDeckCard,
    bulkAddCards, renameDeckCardSection, moveDeckCardsToSection, updateDeckCardVersion,
  }
}
