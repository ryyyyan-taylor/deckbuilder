import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDeck } from '../../hooks/useDeck'
import type { Deck, DeckCard, DeckInput, Card } from '../../hooks/useDeck'
import { DeckForm } from './DeckForm'
import { DeckSection } from './DeckSection'
import type { SortBy } from './DeckSection'
import { StatsPanel } from './StatsPanel'
import { CardSearch } from '../cards/CardSearch'
import { SuggestionsPanel } from './SuggestionsPanel'
import { ResultsPanel } from './ResultsPanel'
import { Toast } from '../Toast'
import type { ToastItem } from '../Toast'

const STATS_SECTION = 'Stats'
const PROTECTED_SECTIONS = ['Mainboard', STATS_SECTION]

function SortablePill({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export function EditDeckPage() {
  const { id } = useParams<{ id: string }>()
  const {
    fetchDeck, updateDeck, addCardToDeck, fetchDeckCards,
    updateDeckCardSection, updateDeckCardQuantity, removeDeckCard,
    renameDeckCardSection, moveDeckCardsToSection, bulkAddCards, updateDeckCardVersion,
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
  const [showMenu, setShowMenu] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)

  const addToast = useCallback((message: string) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const sections = deck?.sections ?? ['Mainboard', STATS_SECTION]
  const cardSections = sections.filter((s) => s !== STATS_SECTION)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.indexOf(active.id as string)
    const newIndex = sections.indexOf(over.id as string)
    const newOrder = arrayMove(sections, oldIndex, newIndex)
    setDeck((prev) => prev ? { ...prev, sections: newOrder } : prev)
    void updateSections(newOrder)
  }

  const loadDeckCards = async () => {
    if (!id) return
    const cards = await fetchDeckCards(id)
    setDeckCards(cards)
  }

  useEffect(() => {
    if (!id) return
    fetchDeck(id).then((d) => {
      if (d) {
        setDeck(d)
        document.title = `${d.name} — Deck Builder`
        // Ensure Stats section exists
        if (!(d.sections ?? []).includes(STATS_SECTION)) {
          const current = d.sections ?? ['Mainboard']
          updateDeck(id, { sections: [...current, STATS_SECTION] }).then((result) => {
            if (result) setDeck(result)
          })
        }
      }
    })
    fetchDeckCards(id).then(setDeckCards)
  }, [id])

  const updateSections = async (newSections: string[]) => {
    if (!id || !deck) return
    const result = await updateDeck(id, { sections: newSections })
    if (result) setDeck(result)
  }

  const handleAddSection = async () => {
    const name = addingSectionName?.trim()
    if (!name || sections.includes(name) || PROTECTED_SECTIONS.includes(name)) {
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
    if (PROTECTED_SECTIONS.includes(sectionName) || !id) return
    const cardsInSection = deckCards.filter((dc) => dc.section === sectionName)
    const message = cardsInSection.length > 0
      ? `Delete "${sectionName}"? Its ${cardsInSection.length} card(s) will be moved to Mainboard.`
      : `Delete "${sectionName}"?`
    if (!window.confirm(message)) return
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
    document.title = `${result.name} — Deck Builder`
    setShowEditForm(false)
  }

  const handleAddCard = async (card: Card, section: string) => {
    if (!id) return
    const success = await addCardToDeck(id, card.id, section)
    if (success) {
      await loadDeckCards()
      addToast(`Added ${card.name}`)
    }
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
    if (success) addToast('Removed card')
    else await loadDeckCards()
  }

  const handleSendToSection = async (deckCardId: string, targetSection: string) => {
    setDeckCards((prev) =>
      prev.map((c) => (c.id === deckCardId ? { ...c, section: targetSection } : c))
    )
    const success = await updateDeckCardSection(deckCardId, targetSection)
    if (success) addToast(`Moved to ${targetSection}`)
    else await loadDeckCards()
  }

  const handleAddToSection = async (cardId: string, targetSection: string) => {
    if (!id) return
    const success = await addCardToDeck(id, cardId, targetSection)
    if (success) {
      await loadDeckCards()
      addToast(`Added to ${targetSection}`)
    }
  }

  const handleChangeVersion = async (deckCardId: string, newCardId: string) => {
    // Optimistic update: swap card_id and fetch new card data
    const oldDeckCards = deckCards
    setDeckCards((prev) =>
      prev.map((dc) => dc.id === deckCardId ? { ...dc, card_id: newCardId } : dc)
    )
    const success = await updateDeckCardVersion(deckCardId, newCardId)
    if (success) {
      await loadDeckCards()
      addToast('Version updated')
    } else {
      setDeckCards(oldDeckCards)
    }
  }

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const handleImport = async () => {
    if (!id || !importUrl.trim()) return
    setImportLoading(true)
    setImportError(null)
    try {
      const res = await fetch('/api/import/moxfield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed')
        setImportLoading(false)
        return
      }
      const { cards, sections: importedSections } = data as {
        cards: { card_id: string; section: string; quantity: number }[]
        sections: string[]
      }
      if (cards.length === 0) {
        setImportError('No cards found in that deck')
        setImportLoading(false)
        return
      }
      // Add any new sections to the deck
      const newSections = importedSections.filter((s: string) => !sections.includes(s))
      if (newSections.length > 0) {
        const result = await updateDeck(id, { sections: [...sections, ...newSections] })
        if (result) setDeck(result)
      }
      // Bulk insert cards
      await bulkAddCards(id, cards)
      await loadDeckCards()
      addToast(`Imported ${cards.length} cards`)
      setShowImportModal(false)
      setImportUrl('')
    } catch {
      setImportError('Failed to import deck')
    }
    setImportLoading(false)
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

  // Commander detection for suggestions/results buttons
  const commanderCards = deckCards.filter((dc) => dc.section === 'Commander')
  const commanderName = commanderCards.length > 0
    ? commanderCards.map((dc) => dc.card?.name).filter(Boolean).join(' / ')
    : null
  const isCommander = deck?.format === 'Commander'
  const isCedh = deck?.format === 'cEDH'
  const isDuelCommander = deck?.format === 'Duel Commander'
  const showSuggestionsButton = isCommander && !!commanderName
  const showResultsButton = (isCedh || isDuelCommander) && !!commanderName
  const resultsSource = isDuelCommander ? 'mtgtop8' as const : 'edhtop16' as const
  const deckCardNames = new Set(deckCards.map((dc) => dc.card?.name?.toLowerCase()).filter(Boolean) as string[])

  const cardsBySection = cardSections.reduce<Record<string, DeckCard[]>>((acc, s) => {
    acc[s] = deckCards.filter((dc) => dc.section === s)
    return acc
  }, {})

  const countForSections = (names: string[]) =>
    deckCards.filter((dc) => names.includes(dc.section)).reduce((sum, dc) => sum + dc.quantity, 0)
  const mainDeckCount = countForSections(['Mainboard', 'Commander'])
  const sideboardCount = cardSections.includes('Sideboard') ? countForSections(['Sideboard']) : 0
  const otherSectionNames = cardSections.filter((s) => !['Mainboard', 'Commander', 'Sideboard'].includes(s))
  const otherCount = countForSections(otherSectionNames)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto px-6 py-8">
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
              <span className="text-gray-500 text-sm">
                {mainDeckCount} Main{sideboardCount > 0 && ` | ${sideboardCount} Sideboard`}{otherCount > 0 && ` | ${otherCount} Other`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showSuggestionsButton && (
              <button
                onClick={() => setShowSuggestions(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium"
              >
                Suggestions
              </button>
            )}
            {showResultsButton && (
              <button
                onClick={() => setShowResults(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded text-sm font-medium"
              >
                Results
              </button>
            )}
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
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold tracking-wider"
                title="Menu"
              >
                &#x2026;
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded shadow-lg z-50">
                  <a
                    href={`/deck/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                    onClick={() => setShowMenu(false)}
                  >
                    Share
                  </a>
                  <button
                    onClick={() => {
                      setShowEditForm(!showEditForm)
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Edit Details
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(true)
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    Import from Moxfield
                  </button>
                </div>
              )}
            </div>
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {sections.map((s) => (
                <SortablePill key={s} id={s}>
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
                      className="flex items-center px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm cursor-grab active:cursor-grabbing hover:border-gray-500 select-none"
                      onDoubleClick={() => {
                        if (PROTECTED_SECTIONS.includes(s)) return
                        setRenamingSection(s)
                        setRenameValue(s)
                      }}
                    >
                      {s}
                      {!PROTECTED_SECTIONS.includes(s) && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
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
                </SortablePill>
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
          </SortableContext>
        </DndContext>

        {/* Card search */}
        <div className="mb-6">
          <CardSearch
            onAdd={handleAddCard}
            sections={cardSections}
            activeSection={cardSections.includes('Mainboard') ? 'Mainboard' : cardSections[0]}
            onHoverCard={setPreviewCard}
          />
        </div>

        {/* Main content + preview panel */}
        <div className="flex gap-6">
          {/* Deck sections — full width */}
          <div className="flex-1 min-w-0">
            <div className="space-y-4">
              {sections.map((s) =>
                s === STATS_SECTION ? (
                  <StatsPanel key={s} deckCards={deckCards} />
                ) : (
                  <DeckSection
                    key={s}
                    section={s}
                    cards={cardsBySection[s]}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemove}
                    onHoverCard={setPreviewCard}
                    sortBy={sortBy}
                    sections={cardSections}
                    onSendToSection={handleSendToSection}
                    onAddToSection={handleAddToSection}
                    onChangeVersion={handleChangeVersion}
                  />
                )
              )}
            </div>
          </div>

          {/* Sticky preview panel — far right */}
          <div className="w-[300px] shrink-0 hidden lg:block">
            <div className="sticky top-[25vh]">
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

        {/* Suggestions panel */}
        {showSuggestions && commanderName && (
          <SuggestionsPanel
            commanderName={commanderName}
            deckCardNames={deckCardNames}
            sections={sections}
            onAdd={async (cardId, section) => {
              if (!id) return
              const success = await addCardToDeck(id, cardId, section)
              if (success) {
                await loadDeckCards()
                addToast(`Added to ${section}`)
              }
            }}
            onClose={() => setShowSuggestions(false)}
          />
        )}

        {/* Results panel */}
        {showResults && commanderName && (
          <ResultsPanel
            commanderName={commanderName}
            source={resultsSource}
            onClose={() => setShowResults(false)}
          />
        )}

        {/* Import from Moxfield modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4">Import from Moxfield</h2>
              <p className="text-gray-400 text-sm mb-3">
                Paste a Moxfield deck URL to import its cards.
              </p>
              <input
                type="text"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://www.moxfield.com/decks/..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !importLoading) handleImport()
                }}
                autoFocus
              />
              {importError && (
                <p className="text-red-400 text-sm mt-2">{importError}</p>
              )}
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowImportModal(false)
                    setImportUrl('')
                    setImportError(null)
                  }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300"
                  disabled={importLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={importLoading || !importUrl.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                >
                  {importLoading ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
