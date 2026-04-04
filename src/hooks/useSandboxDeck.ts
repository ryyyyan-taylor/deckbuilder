import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Card, Deck, DeckCard, DeckInput } from './useDeck'

const STORAGE_DECK = 'sandbox_deck'
const STORAGE_CARDS = 'sandbox_cards'
export const SANDBOX_ID = 'sandbox'

const DEFAULT_DECK: Deck = {
  id: SANDBOX_ID,
  user_id: '',
  name: 'Sandbox',
  format: null,
  description: null,
  is_public: false,
  sections: ['Mainboard', 'Stats'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function loadFromStorage(): { deck: Deck; cards: DeckCard[] } {
  try {
    const deckRaw = sessionStorage.getItem(STORAGE_DECK)
    const cardsRaw = sessionStorage.getItem(STORAGE_CARDS)
    if (deckRaw && cardsRaw) {
      return { deck: JSON.parse(deckRaw), cards: JSON.parse(cardsRaw) }
    }
  } catch {}
  return { deck: DEFAULT_DECK, cards: [] }
}

function saveToStorage(deck: Deck, cards: DeckCard[]) {
  try {
    sessionStorage.setItem(STORAGE_DECK, JSON.stringify(deck))
    sessionStorage.setItem(STORAGE_CARDS, JSON.stringify(cards))
  } catch {}
}

export function useSandboxDeck() {
  const { deck: initialDeck, cards: initialCards } = loadFromStorage()

  const [deck, setDeck] = useState<Deck>(initialDeck)
  const [deckCards, setDeckCards] = useState<DeckCard[]>(initialCards)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs so sequential mutations (e.g. bulk edit loops) always see current state
  const deckRef = useRef<Deck>(initialDeck)
  const deckCardsRef = useRef<DeckCard[]>(initialCards)

  const commitDeck = (newDeck: Deck) => {
    deckRef.current = newDeck
    setDeck(newDeck)
    saveToStorage(newDeck, deckCardsRef.current)
    return newDeck
  }

  const commitCards = (newCards: DeckCard[]) => {
    deckCardsRef.current = newCards
    setDeckCards(newCards)
    saveToStorage(deckRef.current, newCards)
  }

  const clearSandbox = () => {
    try {
      sessionStorage.removeItem(STORAGE_DECK)
      sessionStorage.removeItem(STORAGE_CARDS)
    } catch {}
    commitDeck(DEFAULT_DECK)
    commitCards([])
  }

  const updateDeck = async (_id: string, fields: Partial<DeckInput>) => {
    const newDeck: Deck = { ...deckRef.current, ...fields, updated_at: new Date().toISOString() }
    return commitDeck(newDeck)
  }

  const addCardToDeck = async (_deckId: string, cardId: string, section: string) => {
    setError(null)
    const { data: cardData, error: cardError } = await supabase
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single()

    if (cardError || !cardData) {
      setError('Card not found')
      return false
    }

    const existing = deckCardsRef.current.find(
      (dc) => dc.card_id === cardId && dc.section === section
    )
    const newCards = existing
      ? deckCardsRef.current.map((dc) =>
          dc.id === existing.id ? { ...dc, quantity: dc.quantity + 1 } : dc
        )
      : [
          ...deckCardsRef.current,
          {
            id: crypto.randomUUID(),
            deck_id: SANDBOX_ID,
            card_id: cardId,
            section,
            quantity: 1,
            card: cardData as Card,
          },
        ]

    commitCards(newCards)
    return true
  }

  const removeDeckCard = async (deckCardId: string) => {
    commitCards(deckCardsRef.current.filter((dc) => dc.id !== deckCardId))
    return true
  }

  const updateDeckCardSection = async (deckCardId: string, newSection: string) => {
    commitCards(
      deckCardsRef.current.map((dc) =>
        dc.id === deckCardId ? { ...dc, section: newSection } : dc
      )
    )
    return true
  }

  const updateDeckCardQuantity = async (deckCardId: string, quantity: number) => {
    if (quantity <= 0) return removeDeckCard(deckCardId)
    commitCards(
      deckCardsRef.current.map((dc) =>
        dc.id === deckCardId ? { ...dc, quantity } : dc
      )
    )
    return true
  }

  const renameDeckCardSection = async (
    _deckId: string,
    oldSection: string,
    newSection: string
  ) => {
    commitCards(
      deckCardsRef.current.map((dc) =>
        dc.section === oldSection ? { ...dc, section: newSection } : dc
      )
    )
    return true
  }

  const moveDeckCardsToSection = async (
    _deckId: string,
    fromSection: string,
    toSection: string
  ) => {
    commitCards(
      deckCardsRef.current.map((dc) =>
        dc.section === fromSection ? { ...dc, section: toSection } : dc
      )
    )
    return true
  }

  const bulkAddCards = async (
    _deckId: string,
    cards: { card_id: string; section: string; quantity: number }[]
  ) => {
    setLoading(true)
    setError(null)

    const cardIds = [...new Set(cards.map((c) => c.card_id))]
    const cardMap = new Map<string, Card>()
    for (let i = 0; i < cardIds.length; i += 100) {
      const batch = cardIds.slice(i, i + 100)
      const { data } = await supabase.from('cards').select('*').in('id', batch)
      for (const card of data ?? []) cardMap.set(card.id, card as Card)
    }

    setLoading(false)

    let newCards = [...deckCardsRef.current]
    for (const c of cards) {
      const card = cardMap.get(c.card_id)
      if (!card) continue
      const existing = newCards.find(
        (dc) => dc.card_id === c.card_id && dc.section === c.section
      )
      if (existing) {
        newCards = newCards.map((dc) =>
          dc.id === existing.id ? { ...dc, quantity: dc.quantity + c.quantity } : dc
        )
      } else {
        newCards.push({
          id: crypto.randomUUID(),
          deck_id: SANDBOX_ID,
          card_id: c.card_id,
          section: c.section,
          quantity: c.quantity,
          card,
        })
      }
    }

    commitCards(newCards)
    return true
  }

  const updateDeckCardVersion = async (deckCardId: string, newCardId: string) => {
    setError(null)
    const { data: cardData } = await supabase
      .from('cards')
      .select('*')
      .eq('id', newCardId)
      .single()

    if (!cardData) return false

    commitCards(
      deckCardsRef.current.map((dc) =>
        dc.id === deckCardId ? { ...dc, card_id: newCardId, card: cardData as Card } : dc
      )
    )
    return true
  }

  return {
    deck,
    deckCards,
    loading,
    error,
    clearSandbox,
    updateDeck,
    addCardToDeck,
    removeDeckCard,
    updateDeckCardSection,
    updateDeckCardQuantity,
    renameDeckCardSection,
    moveDeckCardsToSection,
    bulkAddCards,
    updateDeckCardVersion,
  }
}
