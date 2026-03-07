import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDeck } from '../../hooks/useDeck'
import type { Deck, DeckCard, DeckInput, Card } from '../../hooks/useDeck'
import { DeckForm } from './DeckForm'
import { DeckSection } from './DeckSection'
import type { SortBy } from './DeckSection'
import { CardSearch } from '../cards/CardSearch'

export function EditDeckPage() {
  const { id } = useParams<{ id: string }>()
  const {
    fetchDeck, updateDeck, addCardToDeck, fetchDeckCards,
    updateDeckCardSection, updateDeckCardQuantity, removeDeckCard,
    renameDeckCardSection, moveDeckCardsToSection,
    loading, error,
  } = useDeck()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [showEditForm, setShowEditForm] = useState(false)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [addingSectionName, setAddingSectionName] = useState<string | null>(null)
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const sections = deck?.sections ?? ['Mainboard']

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

  const updateSections = async (newSections: string[]) => {
    if (!id || !deck) return
    const result = await updateDeck(id, { sections: newSections })
    if (result) setDeck(result)
  }

  const handleAddSection = async () => {
    const name = addingSectionName?.trim()
    if (!name || sections.includes(name)) {
      setAddingSectionName(null)
      return
    }
    await updateSections([...sections, name])
    setAddingSectionName(null)
  }

  const handleRenameSection = async (oldName: string) => {
    const newName = renameValue.trim()
    if (!newName || newName === oldName || sections.includes(newName)) {
      setRenamingSection(null)
      return
    }
    if (!id) return
    // Update deck_cards first, then update sections array
    const success = await renameDeckCardSection(id, oldName, newName)
    if (success) {
      setDeckCards((prev) =>
        prev.map((dc) => dc.section === oldName ? { ...dc, section: newName } : dc)
      )
      await updateSections(sections.map((s) => s === oldName ? newName : s))
    }
    setRenamingSection(null)
  }

  const handleRemoveSection = async (sectionName: string) => {
    if (sectionName === 'Mainboard' || !id) return
    const cardsInSection = deckCards.filter((dc) => dc.section === sectionName)
    if (cardsInSection.length > 0) {
      const success = await moveDeckCardsToSection(id, sectionName, 'Mainboard')
      if (success) {
        setDeckCards((prev) =>
          prev.map((dc) => dc.section === sectionName ? { ...dc, section: 'Mainboard' } : dc)
        )
      } else {
        return
      }
    }
    await updateSections(sections.filter((s) => s !== sectionName))
  }

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

  const handleSendToSection = async (deckCardId: string, targetSection: string) => {
    setDeckCards((prev) =>
      prev.map((c) => (c.id === deckCardId ? { ...c, section: targetSection } : c))
    )
    const success = await updateDeckCardSection(deckCardId, targetSection)
    if (!success) await loadDeckCards()
  }

  // Focus inputs when they appear
  useEffect(() => {
    if (renamingSection && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingSection])

  useEffect(() => {
    if (addingSectionName !== null && addInputRef.current) {
      addInputRef.current.focus()
    }
  }, [addingSectionName])

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
      <div className="max-w-[1600px] mx-auto px-4 py-8">
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
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded text-sm">
              <button
                onClick={() => setSortBy('name')}
                className={`px-3 py-1.5 rounded-l ${sortBy === 'name' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
              >
                Name
              </button>
              <button
                onClick={() => setSortBy('cmc')}
                className={`px-3 py-1.5 rounded-r ${sortBy === 'cmc' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
              >
                Mana Value
              </button>
            </div>
            <button
              onClick={() => setShowEditForm(!showEditForm)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm"
            >
              {showEditForm ? 'Cancel' : 'Edit Details'}
            </button>
          </div>
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

        {/* Section management bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {sections.map((s) => (
            <div key={s} className="flex items-center">
              {renamingSection === s ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSection(s)
                    if (e.key === 'Escape') setRenamingSection(null)
                  }}
                  onBlur={() => handleRenameSection(s)}
                  className="px-3 py-1 bg-gray-700 border border-blue-500 rounded text-sm focus:outline-none"
                />
              ) : (
                <span
                  className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm cursor-pointer hover:border-gray-500 select-none"
                  onDoubleClick={() => {
                    if (s === 'Mainboard') return
                    setRenamingSection(s)
                    setRenameValue(s)
                  }}
                >
                  {s}
                  {s !== 'Mainboard' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveSection(s)
                      }}
                      className="ml-2 text-gray-500 hover:text-red-400"
                      title={`Remove ${s}`}
                    >
                      &times;
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}

          {addingSectionName !== null ? (
            <input
              ref={addInputRef}
              type="text"
              value={addingSectionName}
              onChange={(e) => setAddingSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSection()
                if (e.key === 'Escape') setAddingSectionName(null)
              }}
              onBlur={handleAddSection}
              placeholder="Section name"
              className="px-3 py-1 bg-gray-700 border border-blue-500 rounded text-sm focus:outline-none w-36"
            />
          ) : (
            <button
              onClick={() => setAddingSectionName('')}
              className="px-3 py-1 border border-dashed border-gray-600 rounded text-sm text-gray-400 hover:text-gray-300 hover:border-gray-500"
            >
              + Add Section
            </button>
          )}
        </div>

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
            <div className="space-y-4">
              {sections.map((s) => (
                <DeckSection
                  key={s}
                  section={s}
                  cards={cardsBySection[s]}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemove}
                  onHoverCard={setPreviewCard}
                  sortBy={sortBy}
                  sections={sections}
                  onSendToSection={handleSendToSection}
                />
              ))}
            </div>
          </div>

          {/* Sticky preview panel */}
          <div className="w-[300px] shrink-0 hidden lg:block">
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
                    {previewCard.oracle_text && (
                      <p className="text-gray-400 text-xs mt-2 whitespace-pre-line leading-relaxed">{previewCard.oracle_text}</p>
                    )}
                    {previewCard.set_code && (
                      <p className="text-gray-600 text-xs uppercase mt-2">{previewCard.set_code}</p>
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
