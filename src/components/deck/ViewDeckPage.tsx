import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useDeck } from '../../hooks/useDeck'
import type { Deck, DeckCard, Card } from '../../hooks/useDeck'
import { DeckSection } from './DeckSection'
import { scryfallArtCropUrl } from '../../lib/cards'
import type { SortBy, ViewMode } from './DeckSection'
import { StatsPanel } from './StatsPanel'
import { TestPanel } from './TestPanel'
import { useAuth } from '../../hooks/useAuth'
import { useSideboardGuide } from '../../hooks/useSideboardGuide'
import { SideboardGuidePanel } from './SideboardGuidePanel'
import CardPreviewPanel from './CardPreviewPanel'

const STATS_SECTION = 'Stats'
const TEST_SECTION = 'Test'

export function ViewDeckPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { fetchDeck, fetchDeckCards, loading } = useDeck()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [viewMode, setViewMode] = useState<ViewMode>('stacks')
  const [notFound, setNotFound] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [karabastCopied, setKarabastCopied] = useState(false)
  const guide = useSideboardGuide()

  const handleCopyKarabastJson = () => {
    const toId = (card: Card | undefined) => {
      if (!card?.set_code || !card?.card_number) return null
      return `${card.set_code}_${String(card.card_number).padStart(3, '0')}`
    }
    const leader = deckCards.find((dc) => dc.section === 'Leader/Base' && dc.card?.swu_type === 'Leader')
    const base = deckCards.find((dc) => dc.section === 'Leader/Base' && dc.card?.swu_type === 'Base')
    const mainCards = deckCards.filter((dc) => dc.section !== 'Leader/Base' && dc.section !== 'Sideboard' && dc.section !== 'Stats' && dc.section !== 'Test')
    const sideboardCards = deckCards.filter((dc) => dc.section === 'Sideboard')
    const missingCardNumber = [leader, base, ...mainCards, ...sideboardCards]
      .filter(Boolean)
      .some((dc) => !dc!.card?.card_number)
    if (missingCardNumber) return
    const json = JSON.stringify({
      metadata: { name: deck!.name },
      ...(leader ? { leader: { id: toId(leader.card), count: 1 } } : {}),
      ...(base ? { base: { id: toId(base.card), count: 1 } } : {}),
      deck: mainCards.map((dc) => ({ id: toId(dc.card), count: dc.quantity })),
      ...(sideboardCards.length > 0 ? { sideboard: sideboardCards.map((dc) => ({ id: toId(dc.card), count: dc.quantity })) } : {}),
    }, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setKarabastCopied(true)
      setTimeout(() => setKarabastCopied(false), 2000)
    })
  }

  useEffect(() => {
    if (!id) return
    fetchDeck(id).then((d) => {
      if (!d) {
        setNotFound(true)
        return
      }
      if (!d.is_public && d.user_id !== user?.id) {
        setNotFound(true)
        return
      }
      setDeck(d)
      document.title = `${d.name} — Deck Builder`
    })
    fetchDeckCards(id).then(setDeckCards)
    void guide.fetchGuide(id)
  // fetchDeck, fetchDeckCards, guide.fetchGuide are not memoized — adding them would
  // cause this effect to re-run on every render. user?.id is stable after login.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading && !deck) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (notFound || (!deck && !loading)) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Deck not found or is private.</p>
          <Link to="/decks" className="text-blue-400 hover:underline text-sm">
            Go to my decks
          </Link>
        </div>
      </div>
    )
  }

  const sections = deck!.sections ?? ['Mainboard']
  const cardSections = sections.filter((s) => s !== STATS_SECTION && s !== TEST_SECTION)
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
  const isOwner = user?.id === deck!.user_id

  const displayArtCard = deck!.display_card_id
    ? deckCards.find((dc) => dc.card_id === deck!.display_card_id)?.card ?? null
    : null
  const bannerArt = displayArtCard?.image_uris?.art_crop
    ?? (displayArtCard?.scryfall_id ? scryfallArtCropUrl(displayArtCard.scryfall_id) : null)
    ?? displayArtCard?.image_uris?.normal
    ?? null

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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to="/" className="text-gray-400 hover:text-gray-300 text-sm">
                &larr; Public Decks
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

            {/* Mobile: 3-dot button */}
            <div className="shrink-0 md:hidden">
              <button
                onClick={() => setShowActionsMenu((p) => !p)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-lg leading-none"
                aria-label="More actions"
              >
                ⋮
              </button>
            </div>

            {/* Desktop: sort + view + edit */}
            <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                {deck!.game === 'swu' && (
                  <button
                    onClick={handleCopyKarabastJson}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  >
                    {karabastCopied ? 'Copied!' : 'Karabast JSON'}
                  </button>
                )}
                {isOwner && (
                  <Link
                    to={`/decks/${deck!.id}/edit`}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
                  >
                    Edit Deck
                  </Link>
                )}
              </div>
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
            </div>
          </div>
        </div>
      </div>

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
              {deck!.game === 'swu' && (
                <button
                  onClick={() => { handleCopyKarabastJson(); setShowActionsMenu(false) }}
                  className="w-full text-left px-4 py-3.5 text-sm text-gray-300 hover:bg-gray-700 border-t border-gray-700"
                >
                  {karabastCopied ? 'Copied!' : 'Karabast JSON'}
                </button>
              )}
              {isOwner && (
                <Link
                  to={`/decks/${deck!.id}/edit`}
                  className="block px-4 py-3.5 text-sm text-blue-400 hover:bg-gray-700 border-t border-gray-700"
                  onClick={() => setShowActionsMenu(false)}
                >
                  Edit Deck
                </Link>
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

      {/* Description */}
      {deck!.description && (
        <div className="px-3 py-3 md:px-6 border-b border-gray-800">
          <p className="text-gray-300 text-sm leading-relaxed max-w-3xl">{deck!.description}</p>
        </div>
      )}

      {/* Two-column layout: sections + preview */}
      <div className="px-3 py-4 md:px-6">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="space-y-4">
              {sections.map((s) =>
                s === STATS_SECTION ? (
                  <StatsPanel key={s} deckCards={deckCards} game={deck!.game ?? 'mtg'} />
                ) : s === TEST_SECTION ? (
                  <TestPanel key={s} deckCards={deckCards} game={deck!.game ?? 'mtg'} onHoverCard={setPreviewCard} />
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
                      isEditable={false}
                      onAddMatchup={async () => null}
                      onRemoveMatchup={async () => false}
                      onRenameMatchup={async () => false}
                      onReorderMatchups={async () => {}}
                      onSetEntry={async () => false}
                    />
                  </div>
                ) : s === 'Sideboard' ? (
                  <div key={s} className="relative">
                    <DeckSection
                      game={deck!.game ?? 'mtg'}
                      section={s}
                      cards={cardsBySection[s]}
                      onHoverCard={setPreviewCard}
                      sortBy={sortBy}
                      viewMode={viewMode}
                      readOnly
                    />
                    {guide.matchups.length > 0 && (
                      <button
                        onClick={() => setShowGuide(true)}
                        className="absolute top-3 right-4 px-3 py-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded text-sm font-medium"
                      >
                        Guide
                      </button>
                    )}
                  </div>
                ) : (
                  <DeckSection
                    key={s}
                    section={s}
                    cards={cardsBySection[s]}
                    game={deck!.game ?? 'mtg'}
                    onHoverCard={setPreviewCard}
                    sortBy={sortBy}
                    viewMode={viewMode}
                    readOnly
                  />
                )
              )}
            </div>
          </div>

          {/* Sticky preview panel */}
          <div className="w-[300px] shrink-0 hidden lg:block">
            <div className="sticky top-[25vh]">
              <CardPreviewPanel card={previewCard} game={deck!.game} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
