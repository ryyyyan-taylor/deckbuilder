import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../../lib/supabase'
import { useDeck } from '../../hooks/useDeck'
import type { Deck, DeckCard, DeckInput, Card } from '../../hooks/useDeck'
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
import { useSideboardGuide } from '../../hooks/useSideboardGuide'
import { scryfallArtCropUrl } from '../../lib/cards'
import { SideboardGuidePanel } from './SideboardGuidePanel'
import { getProtectedSections } from '../../lib/games'
import CardPreviewPanel from './CardPreviewPanel'

const STATS_SECTION = 'Stats'
const TEST_SECTION = 'Test'

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
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeMobileCard, setActiveMobileCard] = useState<DeckCard | null>(null)
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false)
  const sheetDragY = useRef<number | null>(null)
  const [versionPickerCard, setVersionPickerCard] = useState<DeckCard | null>(null)
  const [versions, setVersions] = useState<Card[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionSearch, setVersionSearch] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [guideConflict, setGuideConflict] = useState<{
    message: string
    onOverride: () => void
  } | null>(null)
  const guide = useSideboardGuide()

  const addToast = useCallback((message: string) => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev, { id, message }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const sections = deck?.sections ?? ['Mainboard', STATS_SECTION, TEST_SECTION]
  const cardSections = sections.filter((s) => s !== STATS_SECTION && s !== TEST_SECTION)
  const protectedSections = getProtectedSections(deck?.game ?? 'mtg', deck?.format ?? '')

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
        // Ensure Stats and Test sections exist
        const current = d.sections ?? ['Mainboard']
        const missing = [STATS_SECTION, TEST_SECTION].filter((s) => !current.includes(s))
        if (missing.length > 0) {
          updateDeck(id, { sections: [...current, ...missing] }).then((result) => {
            if (result) setDeck(result)
          })
        }
      }
    })
    fetchDeckCards(id).then(setDeckCards)
    void guide.fetchGuide(id)
  // fetchDeck, fetchDeckCards, updateDeck, guide.fetchGuide are not memoized — adding
  // them would cause this effect to re-run on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-set display card for commander decks that have a commander but no display card
  useEffect(() => {
    if (!deck || !id) return
    if (deck.display_card_id) return
    if (!['Commander', 'cEDH', 'Duel Commander'].includes(deck.format ?? '')) return
    if (deckCards.length === 0) return
    const commanderCard = deckCards.find((dc) => dc.section === 'Commander')
    if (!commanderCard) return
    updateDeck(id, { display_card_id: commanderCard.card_id }).then((result) => {
      if (result) setDeck(result)
    })
  // updateDeck is not memoized — adding it would cause infinite re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deck?.display_card_id, deckCards.length])

  const updateSections = async (newSections: string[]) => {
    if (!id || !deck) return
    const result = await updateDeck(id, { sections: newSections })
    if (result) setDeck(result)
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
    if (protectedSections.includes(sectionName) || !id) return
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

  const executeQuantityChange = async (deckCardId: string, quantity: number) => {
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

  const handleQuantityChange = async (deckCardId: string, quantity: number) => {
    const deckCard = deckCards.find((dc) => dc.id === deckCardId)
    if (deckCard?.card?.name && guide.matchups.length > 0) {
      const section = (deckCard.section === 'Sideboard' ? 'Sideboard' : 'Mainboard') as 'Mainboard' | 'Sideboard'
      const conflicts = guide.checkConflict(deckCard.card.name, section, quantity)
      if (conflicts.length > 0) {
        setGuideConflict({
          message: `${quantity <= 0 ? `Removing ${deckCard.card.name}` : `Reducing ${deckCard.card.name} to ×${quantity}`} in ${section} breaks your sideboard guide for: ${conflicts.join(', ')}.`,
          onOverride: () => void executeQuantityChange(deckCardId, quantity),
        })
        return
      }
    }
    await executeQuantityChange(deckCardId, quantity)
  }

  const executeRemove = async (deckCardId: string) => {
    setDeckCards((prev) => prev.filter((dc) => dc.id !== deckCardId))
    const success = await removeDeckCard(deckCardId)
    if (success) addToast('Removed card')
    else await loadDeckCards()
  }

  const handleRemove = async (deckCardId: string) => {
    const deckCard = deckCards.find((dc) => dc.id === deckCardId)
    if (deckCard?.card?.name && guide.matchups.length > 0) {
      const section = (deckCard.section === 'Sideboard' ? 'Sideboard' : 'Mainboard') as 'Mainboard' | 'Sideboard'
      const conflicts = guide.checkConflict(deckCard.card.name, section, 0)
      if (conflicts.length > 0) {
        setGuideConflict({
          message: `Removing ${deckCard.card.name} from ${section} breaks your sideboard guide for: ${conflicts.join(', ')}.`,
          onOverride: () => void executeRemove(deckCardId),
        })
        return
      }
    }
    await executeRemove(deckCardId)
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
    if (!id || !importUrl.trim()) return
    setImportLoading(true)
    setImportError(null)
    try {
      const endpoint = deck!.game === 'swu' ? '/api/import/swudb' : '/api/import/moxfield'
      const res = await fetch(endpoint, {
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
    if (!id) return
    setBulkEditSaving(true)
    setBulkEditErrors([])

    // Parse all section texts
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
      // Deduplicate by name (sum quantities)
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
        const exists = currentCards.some((dc) => dc.card?.name?.toLowerCase() === name.toLowerCase())
        if (!exists) namesToLookup.add(name)
      }
    }

    // Look up new card names in the cards table.
    // Two-pass: exact .in() first, then case-insensitive .ilike() fallback for
    // any names not found — handles case differences and invisible characters.
    const cardLookup = new Map<string, string>() // name lower → card id
    const nameArray = [...namesToLookup]
    if (nameArray.length > 0) {
      const { data: foundCards } = await supabase
        .from('cards')
        .select('id, name')
        .in('name', nameArray)
        .order('released_at', { ascending: true, nullsFirst: false })
      // First-write-wins: earliest printing (lowest released_at) wins per name
      for (const card of foundCards ?? []) {
        const key = (card.name as string).toLowerCase()
        if (!cardLookup.has(key)) cardLookup.set(key, card.id as string)
      }
      // Fallback: ilike for any names the exact match missed
      const stillMissing = nameArray.filter((n) => !cardLookup.has(n.toLowerCase()))
      for (const name of stillMissing) {
        const { data: fuzzy } = await supabase
          .from('cards')
          .select('id, name')
          .ilike('name', name)
          .order('released_at', { ascending: true, nullsFirst: false })
          .limit(1)
        if (fuzzy?.[0]) cardLookup.set(name.toLowerCase(), fuzzy[0].id as string)
      }
    }

    // Build diff
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
          if (dc.quantity !== entry.quantity) updates.push({ deckCardId: dc.id, quantity: entry.quantity })
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

    // Check sideboard guide conflicts before applying bulk changes
    if (guide.matchups.length > 0) {
      const conflictMatchups = new Set<string>()
      for (const deckCardId of removes) {
        const dc = deckCards.find((c) => c.id === deckCardId)
        if (dc?.card?.name) {
          const section = (dc.section === 'Sideboard' ? 'Sideboard' : 'Mainboard') as 'Mainboard' | 'Sideboard'
          guide.checkConflict(dc.card.name, section, 0).forEach((c) => conflictMatchups.add(c))
        }
      }
      for (const { deckCardId, quantity } of updates) {
        const dc = deckCards.find((c) => c.id === deckCardId)
        if (dc?.card?.name) {
          const section = (dc.section === 'Sideboard' ? 'Sideboard' : 'Mainboard') as 'Mainboard' | 'Sideboard'
          guide.checkConflict(dc.card.name, section, quantity).forEach((c) => conflictMatchups.add(c))
        }
      }
      if (conflictMatchups.size > 0) {
        const doSave = async () => {
          setBulkEditSaving(true)
          for (const deckCardId of removes) await removeDeckCard(deckCardId)
          for (const { deckCardId, quantity } of updates) await updateDeckCardQuantity(deckCardId, quantity)
          if (adds.length > 0) await bulkAddCards(id, adds)
          await loadDeckCards()
          setBulkEditMode(false)
          addToast('Bulk edit saved')
          setBulkEditSaving(false)
        }
        setGuideConflict({
          message: `Bulk edit breaks your sideboard guide for: ${[...conflictMatchups].join(', ')}.`,
          onOverride: doSave,
        })
        setBulkEditSaving(false)
        return
      }
    }

    for (const deckCardId of removes) await removeDeckCard(deckCardId)
    for (const { deckCardId, quantity } of updates) await updateDeckCardQuantity(deckCardId, quantity)
    if (adds.length > 0) await bulkAddCards(id, adds)

    await loadDeckCards()
    setBulkEditMode(false)
    addToast('Bulk edit saved')
    setBulkEditSaving(false)
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

  // Lock body scroll while mobile action sheet is open
  useEffect(() => {
    if (!activeMobileCard) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [activeMobileCard])

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
  const commanderColorIdentity = deck?.game === 'mtg' && ['Commander', 'cEDH', 'Duel Commander'].includes(deck?.format ?? '')
    ? [...new Set(commanderCards.flatMap((dc) => dc.card?.color_identity ?? []))]
    : undefined
  const isCommander = deck?.game === 'mtg' && deck?.format === 'Commander'
  const isCedh = deck?.game === 'mtg' && deck?.format === 'cEDH'
  const isDuelCommander = deck?.game === 'mtg' && deck?.format === 'Duel Commander'
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

  const displayArtCard = deck?.display_card_id
    ? deckCards.find((dc) => dc.card_id === deck.display_card_id)?.card ?? null
    : null
  const bannerArt = displayArtCard?.image_uris?.art_crop
    ?? (displayArtCard?.scryfall_id ? scryfallArtCropUrl(displayArtCard.scryfall_id) : null)
    ?? displayArtCard?.image_uris?.normal
    ?? null

  const displayCardOptions = [...new Map(
    deckCards
      .filter((dc) => ['Commander', 'Mainboard'].includes(dc.section))
      .map((dc) => [dc.card_id, { card_id: dc.card_id, name: dc.card?.name ?? 'Unknown' }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Art banner */}
      <div className="relative bg-gray-800 overflow-hidden">
        {bannerArt && (
          <>
            <img
              src={bannerArt}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-right"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/85 to-gray-900/40" />
          </>
        )}
        <div className="relative px-3 py-4 md:px-6 md:py-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to="/decks" className="text-gray-400 hover:text-gray-300 text-sm">
              &larr; Back to decks
            </Link>
            <h1 className="text-xl md:text-2xl font-bold mt-1 truncate">{deck!.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
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

          {/* Mobile: hamburger button */}
          <div className="shrink-0 md:hidden">
            <button
              onClick={() => setShowActionsMenu((p) => !p)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-lg leading-none"
              aria-label="More actions"
            >
              ⋮
            </button>
          </div>

          {/* Desktop: flat buttons */}
          <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
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
              <Link
                to={`/compare?deck=${id}`}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Compare
              </Link>
              <a
                href={`/deck/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Share
              </a>
              <button
                onClick={() => setShowEditForm(!showEditForm)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Edit Details
              </button>
              <button
                onClick={bulkEditMode ? () => { setBulkEditMode(false); setBulkEditErrors([]) } : enterBulkEdit}
                className={`px-3 py-1.5 rounded text-sm ${bulkEditMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
              </button>
              {bulkEditMode && (
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  Import
                </button>
              )}
            </div>
            {!bulkEditMode && (
              <div className="flex items-center gap-2">
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
              </div>
            )}
          </div>
          </div>

          {/* Description inside banner */}
          {deck!.description && !showEditForm && (
            <p className="text-gray-300 text-sm leading-relaxed max-w-3xl mt-3">{deck!.description}</p>
          )}

          {/* Section management bar — inside banner so art extends behind it */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 md:flex-wrap">
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
        </div>
      </div>

      {/* Page content */}
      <div className="px-3 py-4 md:px-6">
        {/* Edit form (collapsible) */}
        {showEditForm && (
          <div className="mb-6 p-4 bg-gray-800 border border-gray-700 rounded">
            <DeckForm
              deck={deck!}
              game={deck?.game ?? 'mtg'}
              onSubmit={handleUpdateDeck}
              onCancel={() => setShowEditForm(false)}
            />
            {/* Display card picker */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <label className="block text-sm font-medium text-gray-300 mb-1">Display Card</label>
              <p className="text-xs text-gray-500 mb-2">Card art shown on listings and the page banner.</p>
              <select
                value={deck!.display_card_id ?? ''}
                onChange={(e) => {
                  const cardId = e.target.value || null
                  void updateDeck(id!, { display_card_id: cardId }).then((result) => {
                    if (result) setDeck(result)
                  })
                }}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-sm"
              >
                <option value="">(None)</option>
                {displayCardOptions.map(({ card_id, name }) => (
                  <option key={card_id} value={card_id}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Card search — collapsible on mobile */}
        <div className="mb-6">
          <button
            onClick={() => setSearchOpen((p) => !p)}
            className="md:hidden w-full flex items-center justify-between px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 hover:border-gray-500 mb-2"
          >
            <span>🔍 Search cards</span>
            <span className="text-gray-500 text-xs">{searchOpen ? '▲' : '▼'}</span>
          </button>
          <div className={`${searchOpen ? 'block' : 'hidden'} md:block`}>
            <CardSearch
              onAdd={handleAddCard}
              sections={cardSections}
              activeSection={cardSections.includes('Mainboard') ? 'Mainboard' : cardSections[0]}
              game={deck?.game ?? 'mtg'}
              onHoverCard={setPreviewCard}
            />
          </div>
        </div>

        {/* Main content + preview panel */}
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            {bulkEditMode ? (
              <div className="space-y-4">
                {bulkEditErrors.length > 0 && (
                  <div className="bg-red-900/30 border border-red-700 rounded p-3">
                    <p className="text-red-400 text-sm font-medium mb-1">Some cards couldn't be found:</p>
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
                      onChange={(e) => setBulkEditText((prev) => ({ ...prev, [section]: e.target.value }))}
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
                  <StatsPanel key={s} deckCards={deckCards} game={deck?.game ?? 'mtg'} commanderColorIdentity={commanderColorIdentity} />
                ) : s === TEST_SECTION ? (
                  <TestPanel key={s} deckCards={deckCards} game={deck?.game ?? 'mtg'} onHoverCard={setPreviewCard} />
                ) : s === 'Sideboard' && showGuide ? (
                  <div key={s} className="rounded border border-gray-700 bg-gray-800/50 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-300">
                        Sideboard <span className="text-gray-500 font-normal">— Guide</span>
                      </h3>
                      <button
                        onClick={() => setShowGuide(false)}
                        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-400"
                      >
                        ← Cards
                      </button>
                    </div>
                    <SideboardGuidePanel
                      matchups={guide.matchups}
                      loading={guide.loading}
                      mainboardCards={deckCards.filter((dc) => dc.section === 'Mainboard')}
                      sideboardCards={deckCards.filter((dc) => dc.section === 'Sideboard')}
                      isEditable={true}
                      onAddMatchup={(name) => guide.addMatchup(id!, name)}
                      onRemoveMatchup={guide.removeMatchup}
                      onRenameMatchup={guide.renameMatchup}
                      onReorderMatchups={guide.reorderMatchups}
                      onSetEntry={guide.setEntry}
                    />
                  </div>
                ) : s === 'Sideboard' ? (
                  <div key={s} className="relative">
                    <DeckSection
                      section={s}
                      cards={cardsBySection[s]}
                      game={deck?.game ?? 'mtg'}
                      onQuantityChange={handleQuantityChange}
                      onRemove={handleRemove}
                      onHoverCard={setPreviewCard}
                      sortBy={sortBy}
                      viewMode={viewMode}
                      sections={cardSections}
                      onSendToSection={handleSendToSection}
                      onAddToSection={handleAddToSection}
                      onMobileTap={(dc) => { setActiveMobileCard(dc); setMobileSheetExpanded(false) }}
                      onRequestVersionPicker={handleOpenVersionPicker}
                    />
                    <button
                      onClick={() => setShowGuide(true)}
                      className="absolute top-3 right-4 px-3 py-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded text-sm font-medium"
                    >
                      Guide
                    </button>
                  </div>
                ) : (
                  <DeckSection
                    key={s}
                    section={s}
                    cards={cardsBySection[s]}
                    game={deck!.game}
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

          {/* Sticky preview panel — far right */}
          <div className="w-[300px] shrink-0 hidden lg:block">
            <div className="sticky top-[25vh]">
              <CardPreviewPanel card={previewCard} game={deck?.game ?? 'mtg'} />
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

        {/* Import modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4">
                {deck!.game === 'swu' ? 'Import from SWUDB' : 'Import from Moxfield'}
              </h2>
              <p className="text-gray-400 text-sm mb-3">
                {deck!.game === 'swu'
                  ? 'Paste a SWUDB deck URL to import its cards.'
                  : 'Paste a Moxfield deck URL to import its cards.'}
              </p>
              <input
                type="text"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder={
                  deck!.game === 'swu'
                    ? 'https://swudb.com/deck/...'
                    : 'https://www.moxfield.com/decks/...'
                }
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

      {/* Guide conflict warning modal */}
      {guideConflict && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md text-white">
            <h2 className="text-base font-semibold mb-2 text-amber-400">Sideboard Guide Conflict</h2>
            <p className="text-sm text-gray-300 mb-4">{guideConflict.message}</p>
            <p className="text-xs text-gray-500 mb-5">Update the guide first to keep it accurate, or override to apply the change anyway.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setGuideConflict(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => { const fn = guideConflict.onOverride; setGuideConflict(null); void fn() }}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-600 rounded text-sm font-medium"
              >
                Override Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile actions bottom sheet */}
      {showActionsMenu && createPortal(
        <div
          className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end md:hidden touch-none"
          onClick={() => setShowActionsMenu(false)}
        >
          <div
            className="bg-gray-800 border-t border-gray-700 rounded-t-2xl w-full max-h-[85vh] flex flex-col touch-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 bg-gray-600 rounded-full" />
            </div>
            <div className="overflow-y-auto overscroll-contain pb-8">
              {/* Sort + View — hidden in bulk edit */}
              {!bulkEditMode && (
                <div className="px-4 py-3 border-b border-gray-700 space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Sort by</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSortBy('name'); setShowActionsMenu(false) }}
                        className={`px-3 py-1.5 rounded text-sm ${sortBy === 'name' ? 'bg-gray-600 text-white' : 'text-gray-400 bg-gray-700'}`}
                      >
                        Name
                      </button>
                      <button
                        onClick={() => { setSortBy('cmc'); setShowActionsMenu(false) }}
                        className={`px-3 py-1.5 rounded text-sm ${sortBy === 'cmc' ? 'bg-gray-600 text-white' : 'text-gray-400 bg-gray-700'}`}
                      >
                        Mana Value
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">View</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setViewMode('stacks'); setShowActionsMenu(false) }}
                        className={`px-3 py-1.5 rounded text-sm ${viewMode === 'stacks' ? 'bg-gray-600 text-white' : 'text-gray-400 bg-gray-700'}`}
                      >
                        Stacks
                      </button>
                      <button
                        onClick={() => { setViewMode('grid'); setShowActionsMenu(false) }}
                        className={`px-3 py-1.5 rounded text-sm ${viewMode === 'grid' ? 'bg-gray-600 text-white' : 'text-gray-400 bg-gray-700'}`}
                      >
                        Grid
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {showSuggestionsButton && (
                <button
                  onClick={() => { setShowSuggestions(true); setShowActionsMenu(false) }}
                  className="w-full text-left px-4 py-3.5 text-sm text-purple-400 hover:bg-gray-700"
                >
                  Suggestions
                </button>
              )}
              {showResultsButton && (
                <button
                  onClick={() => { setShowResults(true); setShowActionsMenu(false) }}
                  className="w-full text-left px-4 py-3.5 text-sm text-amber-400 hover:bg-gray-700"
                >
                  Results
                </button>
              )}
              <Link
                to={`/compare?deck=${id}`}
                className="block px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-700 border-t border-gray-700"
                onClick={() => setShowActionsMenu(false)}
              >
                Compare
              </Link>
              <a
                href={`/deck/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-700 border-t border-gray-700"
                onClick={() => setShowActionsMenu(false)}
              >
                Share
              </a>
              <button
                onClick={() => { setShowEditForm(!showEditForm); setShowActionsMenu(false) }}
                className="w-full text-left px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-700 border-t border-gray-700"
              >
                Edit Details
              </button>
              <button
                onClick={() => {
                  if (bulkEditMode) { setBulkEditMode(false); setBulkEditErrors([]) } else { enterBulkEdit() }
                  setShowActionsMenu(false)
                }}
                className="w-full text-left px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-700 border-t border-gray-700"
              >
                {bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
              </button>
              {bulkEditMode && (
                <button
                  onClick={() => { setShowImportModal(true); setShowActionsMenu(false) }}
                  className="w-full text-left px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-700 border-t border-gray-700"
                >
                  Import
                </button>
              )}
              <button
                onClick={() => setShowActionsMenu(false)}
                className="w-full text-center px-4 py-3.5 text-sm text-gray-400 border-t border-gray-700 mt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mobile card action sheet */}
      {activeMobileCard && (() => {
        const live = deckCards.find(dc => dc.id === activeMobileCard.id) ?? activeMobileCard
        const otherSections = cardSections.filter(s => s !== live.section)
        return createPortal(
          <div
            className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-end text-white md:hidden touch-none"
            onClick={() => setActiveMobileCard(null)}
          >
            {/* Card image — shrinks when sheet is expanded */}
            <div
              className={`transition-all duration-300 ease-out flex items-center justify-center pointer-events-none px-8 min-h-0 ${
                mobileSheetExpanded ? 'h-28 pb-1' : 'flex-1 pb-4'
              }`}
            >
              {live.card?.image_uris?.normal ? (
                <img
                  src={live.card.image_uris.normal}
                  alt={live.card?.name ?? 'Card'}
                  className="rounded-xl shadow-2xl object-contain transition-all duration-300 ease-out max-h-full w-auto"
                  draggable={false}
                />
              ) : (
                <div className={`bg-gray-700 rounded-xl flex items-center justify-center text-sm text-gray-300 p-2 text-center shadow-2xl aspect-[2.5/3.5] transition-all duration-300 ease-out ${
                  mobileSheetExpanded ? 'w-[90px]' : 'w-[200px]'
                }`}>
                  {live.card?.name}
                </div>
              )}
            </div>
            {/* Bottom sheet */}
            <div
              className={`bg-gray-800 border-t border-gray-600 rounded-t-2xl w-full flex flex-col transition-all duration-300 ease-out touch-auto ${
                mobileSheetExpanded ? 'max-h-[88vh]' : 'max-h-[45vh]'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle — swipe up to expand, swipe down to collapse */}
              <div
                className="flex justify-center pt-3 pb-2 shrink-0 touch-none"
                onTouchStart={(e) => { sheetDragY.current = e.touches[0].clientY }}
                onTouchEnd={(e) => {
                  if (sheetDragY.current === null) return
                  const dy = e.changedTouches[0].clientY - sheetDragY.current
                  if (!mobileSheetExpanded && dy < -40) setMobileSheetExpanded(true)
                  else if (mobileSheetExpanded && dy > 40) setMobileSheetExpanded(false)
                  sheetDragY.current = null
                }}
              >
                <div className="w-10 h-1 bg-gray-600 rounded-full" />
              </div>
              <div className="px-4 pb-8 overflow-y-auto overscroll-contain touch-auto">
                <p className="text-sm font-semibold text-center text-gray-200 mb-4">
                  {live.card?.name}
                </p>

                {/* Quantity row */}
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

                {/* Remove */}
                <button
                  onClick={() => { handleRemove(live.id); setActiveMobileCard(null) }}
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-gray-700 rounded-lg"
                >
                  Remove from deck
                </button>

                {/* Send To */}
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

                {/* Add To */}
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

                {/* Change Version */}
                <div className="border-t border-gray-700 mt-2 pt-2">
                  <button
                    onClick={() => handleOpenVersionPicker(live)}
                    className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                  >
                    Change Version
                  </button>
                </div>

                {/* View on Scryfall */}
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
