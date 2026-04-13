import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabase'
import { useSandboxDeck, SANDBOX_ID } from '../../hooks/useSandboxDeck'
import type { DeckCard, DeckInput, Card } from '../../hooks/useDeck'
import { DeckForm } from './DeckForm'
import { DeckSection } from './DeckSection'
import type { SortBy, ViewMode } from './DeckSection'
import { StatsPanel } from './StatsPanel'
import { TestPanel } from './TestPanel'
import { CardSearch } from '../cards/CardSearch'
import { SuggestionsPanel } from './SuggestionsPanel'
import { ResultsPanel } from './ResultsPanel'
import { Toast } from '../Toast'
import type { ToastItem } from '../Toast'

const STATS_SECTION = 'Stats'
const TEST_SECTION = 'Test'
const PROTECTED_SECTIONS = ['Mainboard', STATS_SECTION, TEST_SECTION]

function SortablePill({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform ? { ...transform, y: 0 } : null), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export function SandboxPage() {
  const {
    deck, deckCards,
    clearSandbox, updateDeck,
    addCardToDeck, removeDeckCard,
    updateDeckCardSection, updateDeckCardQuantity,
    renameDeckCardSection, moveDeckCardsToSection,
    bulkAddCards, updateDeckCardVersion,
  } = useSandboxDeck()

  const [showEditForm, setShowEditForm] = useState(false)
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [viewMode, setViewMode] = useState<ViewMode>('stacks')
  const [addingSectionName, setAddingSectionName] = useState<string | null>(null)
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkEditText, setBulkEditText] = useState<Record<string, string>>({})
  const [bulkEditSaving, setBulkEditSaving] = useState(false)
  const [bulkEditErrors, setBulkEditErrors] = useState<string[]>([])
  const [importUrl, setImportUrl] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const [activeMobileCard, setActiveMobileCard] = useState<DeckCard | null>(null)
  const [versionPickerCard, setVersionPickerCard] = useState<DeckCard | null>(null)
  const [versions, setVersions] = useState<Card[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionSearch, setVersionSearch] = useState('')

  const addToast = useCallback((message: string) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    document.title = `${deck.name} — Sandbox`
  }, [deck.name])

  const sections = deck.sections ?? ['Mainboard', STATS_SECTION, TEST_SECTION]
  const cardSections = sections.filter((s) => s !== STATS_SECTION && s !== TEST_SECTION)
  const commanderFormats = ['Commander', 'cEDH', 'Duel Commander']
  const protectedSections = commanderFormats.includes(deck.format ?? '')
    ? [...PROTECTED_SECTIONS, 'Commander']
    : PROTECTED_SECTIONS

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.indexOf(active.id as string)
    const newIndex = sections.indexOf(over.id as string)
    const newOrder = arrayMove(sections, oldIndex, newIndex)
    void updateDeck(SANDBOX_ID, { sections: newOrder })
  }

  const updateSections = async (newSections: string[]) => {
    await updateDeck(SANDBOX_ID, { sections: newSections })
  }

  const handleAddSection = async () => {
    const name = addingSectionName?.trim()
    if (!name || sections.includes(name) || protectedSections.includes(name)) {
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
    await renameDeckCardSection(SANDBOX_ID, oldName, newName)
    await updateSections(sections.map((s) => s === oldName ? newName : s))
    setRenamingSection(null)
  }

  const handleRemoveSection = async (sectionName: string) => {
    if (protectedSections.includes(sectionName)) return
    const cardsInSection = deckCards.filter((dc) => dc.section === sectionName)
    const message = cardsInSection.length > 0
      ? `Delete "${sectionName}"? Its ${cardsInSection.length} card(s) will be moved to Mainboard.`
      : `Delete "${sectionName}"?`
    if (!window.confirm(message)) return
    if (cardsInSection.length > 0) {
      await moveDeckCardsToSection(SANDBOX_ID, sectionName, 'Mainboard')
    }
    await updateSections(sections.filter((s) => s !== sectionName))
  }

  const handleUpdateDeck = async (data: DeckInput) => {
    await updateDeck(SANDBOX_ID, data)
    setShowEditForm(false)
  }

  const handleAddCard = async (card: Card, section: string) => {
    const success = await addCardToDeck(SANDBOX_ID, card.id, section)
    if (success) addToast(`Added ${card.name}`)
  }

  const handleQuantityChange = async (deckCardId: string, quantity: number) => {
    await updateDeckCardQuantity(deckCardId, quantity)
  }

  const handleRemove = async (deckCardId: string) => {
    await removeDeckCard(deckCardId)
    addToast('Removed card')
  }

  const handleSendToSection = async (deckCardId: string, targetSection: string) => {
    await updateDeckCardSection(deckCardId, targetSection)
    addToast(`Moved to ${targetSection}`)
  }

  const handleAddToSection = async (cardId: string, targetSection: string) => {
    const success = await addCardToDeck(SANDBOX_ID, cardId, targetSection)
    if (success) addToast(`Added to ${targetSection}`)
  }

  const handleChangeVersion = async (deckCardId: string, newCardId: string) => {
    const success = await updateDeckCardVersion(deckCardId, newCardId)
    if (success) addToast('Version updated')
  }

  const handleOpenVersionPicker = async (deckCard: DeckCard) => {
    setActiveMobileCard(null)
    setVersionPickerCard(deckCard)
    setSelectedVersionId(deckCard.card_id)
    setVersionSearch('')
    setVersionsLoading(true)
    const { data } = await supabase
      .from('cards')
      .select('*')
      .eq('name', deckCard.card?.name ?? '')
      .order('set_code')
    setVersions((data ?? []) as Card[])
    setVersionsLoading(false)
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
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
      const newSections = importedSections.filter((s: string) => !sections.includes(s))
      if (newSections.length > 0) {
        await updateDeck(SANDBOX_ID, { sections: [...sections, ...newSections] })
      }
      await bulkAddCards(SANDBOX_ID, cards)
      addToast(`Imported ${cards.length} cards`)
      setShowImportModal(false)
      setImportUrl('')
    } catch {
      setImportError('Failed to import deck')
    }
    setImportLoading(false)
  }

  const handleReset = () => {
    if (!window.confirm('Reset the sandbox? All cards will be cleared.')) return
    clearSandbox()
    setBulkEditMode(false)
    setBulkEditErrors([])
    addToast('Sandbox reset')
  }

  const enterBulkEdit = () => {
    const text: Record<string, string> = {}
    for (const section of cardSections) {
      const sectionCards = (cardsBySection[section] ?? [])
        .slice()
        .sort((a, b) => (a.card?.name ?? '').localeCompare(b.card?.name ?? ''))
      text[section] = sectionCards
        .map((dc) => `${dc.quantity} ${dc.card?.name ?? ''}`)
        .join('\n')
    }
    setBulkEditText(text)
    setBulkEditErrors([])
    setBulkEditMode(true)
  }

  const handleBulkEditSave = async () => {
    setBulkEditSaving(true)
    setBulkEditErrors([])

    const parsedSections = new Map<string, { name: string; quantity: number }[]>()
    const namesToLookup = new Set<string>()

    for (const section of cardSections) {
      const entries: { name: string; quantity: number }[] = []
      for (const line of (bulkEditText[section] ?? '').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const match = trimmed.match(/^(\d+)\s+(.+)$/)
        if (match) {
          entries.push({ quantity: parseInt(match[1], 10), name: match[2].trim() })
        } else {
          entries.push({ quantity: 1, name: trimmed })
        }
      }
      const deduped = new Map<string, { name: string; quantity: number }>()
      for (const entry of entries) {
        const key = entry.name.toLowerCase()
        if (deduped.has(key)) {
          deduped.get(key)!.quantity += entry.quantity
        } else {
          deduped.set(key, { ...entry })
        }
      }
      parsedSections.set(section, [...deduped.values()])

      const currentCards = cardsBySection[section] ?? []
      for (const { name } of deduped.values()) {
        const exists = currentCards.some(
          (dc) => dc.card?.name?.toLowerCase() === name.toLowerCase()
        )
        if (!exists) namesToLookup.add(name)
      }
    }

    const cardLookup = new Map<string, string>()
    const nameArray = [...namesToLookup]
    if (nameArray.length > 0) {
      const { data: foundCards } = await supabase
        .from('cards')
        .select('id, name')
        .in('name', nameArray)
      for (const card of foundCards ?? []) {
        cardLookup.set((card.name as string).toLowerCase(), card.id as string)
      }
    }

    const removes: string[] = []
    const updates: { deckCardId: string; quantity: number }[] = []
    const adds: { card_id: string; section: string; quantity: number }[] = []
    const errors: string[] = []

    for (const section of cardSections) {
      const newEntries = parsedSections.get(section) ?? []
      const currentCards = cardsBySection[section] ?? []

      const currentByNameLower = new Map<string, DeckCard>()
      for (const dc of currentCards) {
        if (dc.card?.name) currentByNameLower.set(dc.card.name.toLowerCase(), dc)
      }

      const newByNameLower = new Map<string, { name: string; quantity: number }>()
      for (const entry of newEntries) {
        newByNameLower.set(entry.name.toLowerCase(), entry)
      }

      for (const [nameLower, dc] of currentByNameLower) {
        if (!newByNameLower.has(nameLower)) removes.push(dc.id)
      }

      for (const [nameLower, entry] of newByNameLower) {
        if (currentByNameLower.has(nameLower)) {
          const dc = currentByNameLower.get(nameLower)!
          if (dc.quantity !== entry.quantity)
            updates.push({ deckCardId: dc.id, quantity: entry.quantity })
        } else {
          const cardId = cardLookup.get(nameLower)
          if (!cardId) {
            errors.push(`"${entry.name}" not found in card database`)
          } else {
            adds.push({ card_id: cardId, section, quantity: entry.quantity })
          }
        }
      }
    }

    if (errors.length > 0) {
      setBulkEditErrors(errors)
      setBulkEditSaving(false)
      return
    }

    for (const deckCardId of removes) await removeDeckCard(deckCardId)
    for (const { deckCardId, quantity } of updates) await updateDeckCardQuantity(deckCardId, quantity)
    if (adds.length > 0) await bulkAddCards(SANDBOX_ID, adds)

    setBulkEditMode(false)
    addToast('Bulk edit saved')
    setBulkEditSaving(false)
  }

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

  const commanderCards = deckCards.filter((dc) => dc.section === 'Commander')
  const commanderName = commanderCards.length > 0
    ? commanderCards.map((dc) => dc.card?.name).filter(Boolean).join(' / ')
    : null
  const commanderColorIdentity = commanderFormats.includes(deck.format ?? '')
    ? [...new Set(commanderCards.flatMap((dc) => dc.card?.color_identity ?? []))]
    : undefined
  const isCommander = deck.format === 'Commander'
  const isCedh = deck.format === 'cEDH'
  const isDuelCommander = deck.format === 'Duel Commander'
  const showSuggestionsButton = isCommander && !!commanderName
  const showResultsButton = (isCedh || isDuelCommander) && !!commanderName
  const resultsSource = isDuelCommander ? 'mtgtop8' as const : 'edhtop16' as const
  const deckCardNames = new Set(
    deckCards.map((dc) => dc.card?.name?.toLowerCase()).filter(Boolean) as string[]
  )

  const cardsBySection = cardSections.reduce<Record<string, DeckCard[]>>((acc, s) => {
    acc[s] = deckCards.filter((dc) => dc.section === s)
    return acc
  }, {})

  const countForSections = (names: string[]) =>
    deckCards.filter((dc) => names.includes(dc.section)).reduce((sum, dc) => sum + dc.quantity, 0)
  const mainDeckCount = countForSections(['Mainboard', 'Commander'])
  const sideboardCount = cardSections.includes('Sideboard') ? countForSections(['Sideboard']) : 0
  const otherSectionNames = cardSections.filter(
    (s) => !['Mainboard', 'Commander', 'Sideboard'].includes(s)
  )
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
            <h1 className="text-2xl font-bold mt-1">{deck.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-300">
                Sandbox
              </span>
              {deck.format && (
                <span className="bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-300">
                  {deck.format}
                </span>
              )}
              <span className="text-gray-500 text-sm">
                {mainDeckCount} Main
                {sideboardCount > 0 && ` | ${sideboardCount} Sideboard`}
                {otherCount > 0 && ` | ${otherCount} Other`}
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
            {!bulkEditMode && (
              <>
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
                <div className="flex items-center bg-gray-800 border border-gray-700 rounded text-sm">
                  <button
                    onClick={() => setViewMode('stacks')}
                    className={`px-3 py-1.5 rounded-l ${viewMode === 'stacks' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                  >
                    Stacks
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-1.5 rounded-r ${viewMode === 'grid' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
                  >
                    Grid
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => setShowEditForm(!showEditForm)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Edit Details
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Import
            </button>
            <button
              onClick={bulkEditMode ? () => { setBulkEditMode(false); setBulkEditErrors([]) } : enterBulkEdit}
              className={`px-3 py-1.5 rounded text-sm ${bulkEditMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-sm"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Edit form (collapsible) */}
        {showEditForm && (
          <div className="mb-6 p-4 bg-gray-800 border border-gray-700 rounded">
            <DeckForm
              deck={deck}
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
                        if (protectedSections.includes(s)) return
                        setRenamingSection(s)
                        setRenameValue(s)
                      }}
                    >
                      {s}
                      {!protectedSections.includes(s) && (
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
          <div className="flex-1 min-w-0">
            {bulkEditMode ? (
              <div className="space-y-4">
                {bulkEditErrors.length > 0 && (
                  <div className="bg-red-900/30 border border-red-700 rounded p-3">
                    <p className="text-red-400 text-sm font-medium mb-1">
                      Some cards couldn't be found:
                    </p>
                    <ul className="text-red-400 text-sm list-disc list-inside">
                      {bulkEditErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
                {cardSections.map((section) => (
                  <div key={section} className="rounded border border-gray-700 bg-gray-800/50 p-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">{section}</h3>
                    <textarea
                      value={bulkEditText[section] ?? ''}
                      onChange={(e) =>
                        setBulkEditText((prev) => ({ ...prev, [section]: e.target.value }))
                      }
                      className="w-full h-48 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm font-mono focus:outline-none focus:border-blue-500 resize-y"
                      placeholder={'1 Card Name\n4 Another Card'}
                      spellCheck={false}
                      disabled={bulkEditSaving}
                    />
                  </div>
                ))}
                <div className="flex gap-3 pb-4">
                  <button
                    onClick={handleBulkEditSave}
                    disabled={bulkEditSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
                  >
                    {bulkEditSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setBulkEditMode(false); setBulkEditErrors([]) }}
                    disabled={bulkEditSaving}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {sections.map((s) =>
                  s === STATS_SECTION ? (
                    <StatsPanel key={s} deckCards={deckCards} commanderColorIdentity={commanderColorIdentity} />
                  ) : s === TEST_SECTION ? (
                    <TestPanel key={s} deckCards={deckCards} onHoverCard={setPreviewCard} />
                  ) : (
                    <DeckSection
                      key={s}
                      section={s}
                      cards={cardsBySection[s]}
                      onQuantityChange={handleQuantityChange}
                      onRemove={handleRemove}
                      onHoverCard={setPreviewCard}
                      sortBy={sortBy}
                      viewMode={viewMode}
                      sections={cardSections}
                      onSendToSection={handleSendToSection}
                      onAddToSection={handleAddToSection}
                      onMobileTap={setActiveMobileCard}
                      onRequestVersionPicker={handleOpenVersionPicker}
                    />
                  )
                )}
              </div>
            )}
          </div>

          {/* Sticky preview panel */}
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
                      <p className="text-gray-400 text-xs mt-2 whitespace-pre-line leading-relaxed">
                        {previewCard.oracle_text}
                      </p>
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
              const success = await addCardToDeck(SANDBOX_ID, cardId, section)
              if (success) addToast(`Added to ${section}`)
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
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md text-white">
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

      {/* Mobile card action sheet */}
      {activeMobileCard && (() => {
        const live = deckCards.find(dc => dc.id === activeMobileCard.id) ?? activeMobileCard
        const otherSections = cardSections.filter(s => s !== live.section)
        return createPortal(
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end text-white md:hidden"
            onClick={() => setActiveMobileCard(null)}
          >
            <div
              className="bg-gray-800 border-t border-gray-600 rounded-t-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-600 rounded-full" />
              </div>
              <div className="px-4 pb-8">
                <p className="text-sm font-semibold text-center text-gray-200 mb-4">
                  {live.card?.name}
                </p>

                <div className="flex items-center justify-center gap-8 mb-4 py-3 bg-gray-700/50 rounded-xl">
                  <button
                    onClick={() => {
                      if (live.quantity - 1 <= 0) setActiveMobileCard(null)
                      handleQuantityChange(live.id, live.quantity - 1)
                    }}
                    className="w-11 h-11 bg-gray-600 hover:bg-gray-500 active:bg-gray-400 rounded-full text-white text-2xl font-bold flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-white font-mono text-xl w-8 text-center select-none">
                    {live.quantity}
                  </span>
                  <button
                    onClick={() => handleQuantityChange(live.id, live.quantity + 1)}
                    className="w-11 h-11 bg-gray-600 hover:bg-gray-500 active:bg-gray-400 rounded-full text-white text-2xl font-bold flex items-center justify-center"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => { handleRemove(live.id); setActiveMobileCard(null) }}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-700 rounded-lg"
                >
                  Remove from deck
                </button>

                {otherSections.length > 0 && (
                  <div className="border-t border-gray-700 mt-2 pt-2">
                    <p className="text-xs text-gray-500 px-4 py-1">Send to</p>
                    {otherSections.map((s) => (
                      <button
                        key={s}
                        onClick={() => { handleSendToSection(live.id, s); setActiveMobileCard(null) }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {otherSections.length > 0 && (
                  <div className="border-t border-gray-700 mt-2 pt-2">
                    <p className="text-xs text-gray-500 px-4 py-1">Add to</p>
                    {otherSections.map((s) => (
                      <button
                        key={s}
                        onClick={() => { handleAddToSection(live.card_id, s); setActiveMobileCard(null) }}
                        className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div className="border-t border-gray-700 mt-2 pt-2">
                  <button
                    onClick={() => handleOpenVersionPicker(live)}
                    className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                  >
                    Change Version
                  </button>
                </div>

                {live.card?.scryfall_id && (
                  <div className="border-t border-gray-700 mt-2 pt-2">
                    <a
                      href={`https://scryfall.com/card/${live.card.scryfall_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                      onClick={() => setActiveMobileCard(null)}
                    >
                      View on Scryfall ↗
                    </a>
                  </div>
                )}

                <button
                  onClick={() => setActiveMobileCard(null)}
                  className="w-full mt-3 py-3 text-sm text-gray-400 text-center border-t border-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}

      {/* Version picker modal */}
      {versionPickerCard && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 text-white"
          onClick={(e) => { if (e.target === e.currentTarget) setVersionPickerCard(null) }}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-semibold mb-1">Change Version</h2>
            <p className="text-gray-400 text-sm mb-3">
              {versionPickerCard.card?.name} — select a printing
            </p>

            <input
              type="text"
              value={versionSearch}
              onChange={(e) => setVersionSearch(e.target.value)}
              placeholder="Filter by set code..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm mb-4 focus:outline-none focus:border-blue-500"
            />

            {versionsLoading ? (
              <p className="text-gray-400 text-sm py-8 text-center">Loading versions...</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {versions
                    .filter((v) => !versionSearch || v.set_code?.toLowerCase().includes(versionSearch.toLowerCase()))
                    .map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVersionId(v.id)}
                      onDoubleClick={() => {
                        if (v.id !== versionPickerCard.card_id) {
                          handleChangeVersion(versionPickerCard.id, v.id)
                          setVersionPickerCard(null)
                        }
                      }}
                      className={`rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedVersionId === v.id
                          ? 'border-blue-500'
                          : 'border-transparent hover:border-gray-500'
                      }`}
                    >
                      {v.image_uris?.normal ? (
                        <img
                          src={v.image_uris.normal}
                          alt={`${v.name} (${v.set_code})`}
                          className="w-full rounded-md"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full aspect-[2.5/3.5] bg-gray-700 flex items-center justify-center text-xs text-gray-400 p-1 text-center">
                          No image
                        </div>
                      )}
                      <p className="text-xs text-gray-400 uppercase text-center mt-1 pb-1">
                        {v.set_code}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-700">
              <button
                onClick={() => setVersionPickerCard(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedVersionId && selectedVersionId !== versionPickerCard.card_id) {
                    handleChangeVersion(versionPickerCard.id, selectedVersionId)
                  }
                  setVersionPickerCard(null)
                }}
                disabled={!selectedVersionId || selectedVersionId === versionPickerCard.card_id}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
              >
                Change
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
