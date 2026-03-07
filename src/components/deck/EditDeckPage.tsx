import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { useDeck } from '../../hooks/useDeck'
import type { Deck, DeckCard, DeckInput, Card } from '../../hooks/useDeck'
import { DeckForm } from './DeckForm'
import { DeckSection } from './DeckSection'
import { CardSearch } from '../cards/CardSearch'

const ALL_SECTIONS = ['Commander', 'Mainboard', 'Sideboard', 'Maybeboard']
const COMMANDER_FORMATS = ['Commander']

function getSections(format: string | null) {
  if (format && COMMANDER_FORMATS.includes(format)) return ALL_SECTIONS
  return ALL_SECTIONS.filter((s) => s !== 'Commander')
}

export function EditDeckPage() {
  const { id } = useParams<{ id: string }>()
  const {
    fetchDeck, updateDeck, addCardToDeck, fetchDeckCards,
    updateDeckCardSection, updateDeckCardQuantity, removeDeckCard,
    loading, error,
  } = useDeck()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [showEditForm, setShowEditForm] = useState(false)
  const [activeDrag, setActiveDrag] = useState<DeckCard | null>(null)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)

  const sections = getSections(deck?.format ?? null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const loadDeckCards = useCallback(async () => {
    if (!id) return
    const cards = await fetchDeckCards(id)
    setDeckCards(cards)
  }, [id])

  useEffect(() => {
    if (id) {
      fetchDeck(id).then((d) => {
        if (d) setDeck(d)
      })
      loadDeckCards()
    }
  }, [id])

  const handleUpdateDeck = async (data: DeckInput) => {
    if (!id) return
    const result = await updateDeck(id, data)
    if (!result) throw new Error(error ?? 'Failed to update deck')
    setDeck(result)
    setShowEditForm(false)
  }

  const handleAddCard = async (card: Card, section: string) => {
    if (!id) return
    const success = await addCardToDeck(id, card.id, section)
    if (success) await loadDeckCards()
  }

  const handleQuantityChange = async (deckCardId: string, quantity: number) => {
    if (quantity <= 0) {
      setDeckCards((prev) => prev.filter((dc) => dc.id !== deckCardId))
    } else {
      setDeckCards((prev) =>
        prev.map((dc) => (dc.id === deckCardId ? { ...dc, quantity } : dc))
      )
    }
    const success = await updateDeckCardQuantity(deckCardId, quantity)
    if (!success) await loadDeckCards()
  }

  const handleRemove = async (deckCardId: string) => {
    setDeckCards((prev) => prev.filter((dc) => dc.id !== deckCardId))
    const success = await removeDeckCard(deckCardId)
    if (!success) await loadDeckCards()
  }

  const handleDragStart = (event: DragStartEvent) => {
    const dc = event.active.data.current?.deckCard as DeckCard | undefined
    setActiveDrag(dc ?? null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return

    const dc = active.data.current?.deckCard as DeckCard | undefined
    if (!dc) return

    const targetSection = over.id as string
    if (dc.section === targetSection) return

    setDeckCards((prev) =>
      prev.map((c) => (c.id === dc.id ? { ...c, section: targetSection } : c))
    )
    const success = await updateDeckCardSection(dc.id, targetSection)
    if (!success) await loadDeckCards()
  }

  if (loading && !deck) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!deck && !loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-red-400">Deck not found.</p>
      </div>
    )
  }

  const cardsBySection = sections.reduce<Record<string, DeckCard[]>>((acc, s) => {
    acc[s] = deckCards.filter((dc) => dc.section === s)
    return acc
  }, {})

  const totalCards = deckCards.reduce((sum, dc) => sum + dc.quantity, 0)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link to="/decks" className="text-gray-400 hover:text-gray-300 text-sm">
              &larr; Back to decks
            </Link>
            <h1 className="text-2xl font-bold mt-1">{deck!.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {deck!.format && (
                <span className="bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-300">
                  {deck!.format}
                </span>
              )}
              <span className="text-gray-500 text-sm">{totalCards} cards</span>
            </div>
          </div>
          <button
            onClick={() => setShowEditForm(!showEditForm)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm"
          >
            {showEditForm ? 'Cancel' : 'Edit Details'}
          </button>
        </div>

        {/* Edit form (collapsible) */}
        {showEditForm && (
          <div className="mb-6 p-4 bg-gray-800 border border-gray-700 rounded">
            <DeckForm
              deck={deck!}
              onSubmit={handleUpdateDeck}
              onCancel={() => setShowEditForm(false)}
            />
          </div>
        )}

        {/* Two-column layout: main content + preview panel */}
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            {/* Card search */}
            <div className="mb-6">
              <CardSearch
                onAdd={handleAddCard}
                sections={sections}
                activeSection={sections.includes('Mainboard') ? 'Mainboard' : sections[0]}
                onHoverCard={setPreviewCard}
              />
            </div>

            {/* Deck sections */}
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-4">
                {sections.map((s) => (
                  <DeckSection
                    key={s}
                    section={s}
                    cards={cardsBySection[s]}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemove}
                    onHoverCard={setPreviewCard}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeDrag && activeDrag.card?.image_uris?.normal ? (
                  <img
                    src={activeDrag.card.image_uris.normal}
                    alt={activeDrag.card.name}
                    className="w-[150px] rounded-lg shadow-2xl opacity-90"
                    draggable={false}
                  />
                ) : activeDrag ? (
                  <div className="w-[150px] aspect-[2.5/3.5] bg-gray-700 rounded-lg shadow-2xl flex items-center justify-center text-xs text-gray-300 p-2 text-center">
                    {activeDrag.card?.name ?? 'Unknown card'}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Sticky preview panel */}
          <div className="w-[250px] shrink-0 hidden lg:block">
            <div className="sticky top-8">
              {previewCard ? (
                <div>
                  {previewCard.image_uris?.normal ? (
                    <img
                      src={previewCard.image_uris.normal}
                      alt={previewCard.name}
                      className="w-full rounded-lg shadow-xl"
                    />
                  ) : (
                    <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-400 p-4 text-center">
                      No image available
                    </div>
                  )}
                  <div className="mt-3 space-y-1">
                    <p className="font-semibold text-sm">{previewCard.name}</p>
                    {previewCard.mana_cost && (
                      <p className="text-gray-400 text-sm">{previewCard.mana_cost}</p>
                    )}
                    {previewCard.type_line && (
                      <p className="text-gray-500 text-xs">{previewCard.type_line}</p>
                    )}
                    {previewCard.set_code && (
                      <p className="text-gray-600 text-xs uppercase">{previewCard.set_code}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full aspect-[2.5/3.5] bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-sm text-gray-600 p-4 text-center">
                  Hover over a card to preview
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
