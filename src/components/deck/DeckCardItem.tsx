import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { DeckCard, Card } from '../../hooks/useDeck'
import { supabase } from '../../lib/supabase'

interface DeckCardItemProps {
  deckCard: DeckCard
  onQuantityChange?: (deckCardId: string, quantity: number) => void
  onRemove?: (deckCardId: string) => void
  onHoverCard?: (card: Card | null) => void
  sections?: string[]
  onSendToSection?: (deckCardId: string, targetSection: string) => void
  onAddToSection?: (cardId: string, targetSection: string) => void
  onChangeVersion?: (deckCardId: string, newCardId: string) => void
  onActiveChange?: (active: boolean) => void
  readOnly?: boolean
}

export function DeckCardItem({ deckCard, onQuantityChange, onRemove, onHoverCard, sections, onSendToSection, onAddToSection, onChangeVersion, onActiveChange, readOnly }: DeckCardItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<'send' | 'add' | null>(null)
  const [showVersionPicker, setShowVersionPicker] = useState(false)
  const [versions, setVersions] = useState<Card[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionSearch, setVersionSearch] = useState('')
  const [mobileActionSheet, setMobileActionSheet] = useState(false)
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)
  const cardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)

  const otherSections = (sections ?? []).filter((s) => s !== deckCard.section)

  const isActive = expanded || !!contextMenu || mobileActionSheet

  // Notify parent when active state changes.
  // onActiveChange is an inline function in DeckSection that changes every render;
  // omitting it is intentional — we only want this to fire when isActive changes.
  useEffect(() => {
    onActiveChange?.(isActive)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  // Close expanded/context menu on click outside or Escape (desktop only)
  useEffect(() => {
    if (!isActive) return

    const handleClick = (e: MouseEvent) => {
      // Mobile action sheet uses its own backdrop — don't interfere
      if (mobileActionSheet) return
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setExpanded(false)
        setContextMenu(null)
        if (isMobile) onHoverCard?.(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
        setContextMenu(null)
        setMobileActionSheet(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isActive, mobileActionSheet, isMobile, onHoverCard])

  // --- Touch / long-press handlers ---
  const handleTouchStart = (_e: React.TouchEvent) => {
    if (readOnly) return
    touchMoved.current = false
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setMobileActionSheet(true)
        setExpanded(false)
        navigator.vibrate?.(30)
      }
      longPressTimer.current = null
    }, 500)
  }

  const handleTouchMove = () => {
    touchMoved.current = true
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleTouchEnd = (_e: React.TouchEvent) => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      if (!touchMoved.current && !readOnly) {
        // Short tap — toggle expanded, show preview
        const newExpanded = !expanded
        setExpanded(newExpanded)
        setMobileActionSheet(false)
        onHoverCard?.(newExpanded ? (deckCard.card ?? null) : null)
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly || isMobile) return
    e.preventDefault()
    if (otherSections.length === 0 && !onChangeVersion) return
    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) {
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  const handleChangeVersionClick = async () => {
    setContextMenu(null)
    setExpanded(false)
    setMobileActionSheet(false)
    setActiveSubmenu(null)
    setVersionsLoading(true)
    setShowVersionPicker(true)
    setSelectedVersionId(deckCard.card_id)
    setVersionSearch('')

    const { data } = await supabase
      .from('cards')
      .select('*')
      .eq('name', deckCard.card?.name ?? '')
      .order('set_code')

    setVersions((data ?? []) as Card[])
    setVersionsLoading(false)
  }

  const imageUrl = deckCard.card?.image_uris?.normal

  return (
    <>
      <div
        ref={cardRef}
        style={{
          zIndex: expanded || contextMenu ? 50 : undefined,
          position: 'relative' as const,
        }}
        className={`relative w-[200px] shrink-0 ${readOnly ? '' : 'cursor-pointer'} ${expanded && isMobile ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}
        onClick={readOnly || isMobile ? undefined : () => { setExpanded((prev) => !prev); setContextMenu(null) }}
        onContextMenu={handleContextMenu}
        onMouseEnter={isMobile ? undefined : () => onHoverCard?.(deckCard.card ?? null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={deckCard.card?.name ?? 'Card'}
            className="w-full rounded-lg"
            draggable={false}
          />
        ) : (
          <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-400 p-2 text-center">
            {deckCard.card?.name ?? 'Unknown card'}
          </div>
        )}

        {/* Quantity badge */}
        {deckCard.quantity > 1 && (
          <span className="absolute top-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
            {deckCard.quantity}x
          </span>
        )}

        {/* Desktop: expanded overlay with controls */}
        {expanded && !readOnly && !isMobile && (
          <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onQuantityChange?.(deckCard.id, deckCard.quantity - 1)
              }}
              className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-bold"
            >
              −
            </button>
            <span className="text-white font-mono text-sm w-6 text-center">
              {deckCard.quantity}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onQuantityChange?.(deckCard.id, deckCard.quantity + 1)
              }}
              className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-bold"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove?.(deckCard.id)
              }}
              className="w-7 h-7 bg-red-700 hover:bg-red-600 rounded text-white text-sm font-bold ml-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Desktop: right-click context menu */}
        {contextMenu && !readOnly && !isMobile && (
          <div
            ref={menuRef}
            className="absolute bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y, zIndex: 100 }}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            {/* Send To submenu */}
            {otherSections.length > 0 && (
              <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu('send')}
              >
                <button className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center justify-between">
                  Send To <span className="text-gray-500 ml-2">&#9656;</span>
                </button>
                {activeSubmenu === 'send' && (
                  <div className="absolute left-full top-0 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[140px]">
                    {otherSections.map((s) => (
                      <button
                        key={s}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSendToSection?.(deckCard.id, s)
                          setContextMenu(null)
                          setExpanded(false)
                          setActiveSubmenu(null)
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add To submenu */}
            {otherSections.length > 0 && (
              <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu('add')}
              >
                <button className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center justify-between">
                  Add To <span className="text-gray-500 ml-2">&#9656;</span>
                </button>
                {activeSubmenu === 'add' && (
                  <div className="absolute left-full top-0 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[140px]">
                    {otherSections.map((s) => (
                      <button
                        key={s}
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddToSection?.(deckCard.card_id, s)
                          setContextMenu(null)
                          setExpanded(false)
                          setActiveSubmenu(null)
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Change Version */}
            {onChangeVersion && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleChangeVersionClick()
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                onMouseEnter={() => setActiveSubmenu(null)}
              >
                Change Version
              </button>
            )}

            {/* View on Scryfall */}
            {deckCard.card?.scryfall_id && (
              <a
                href={`https://scryfall.com/card/${deckCard.card.scryfall_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                onMouseEnter={() => setActiveSubmenu(null)}
                onClick={() => setContextMenu(null)}
              >
                View on Scryfall
              </a>
            )}
          </div>
        )}
      </div>

      {/* Mobile: long-press action sheet */}
      {mobileActionSheet && !readOnly && isMobile && createPortal(
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end text-white"
          onClick={() => setMobileActionSheet(false)}
        >
          <div
            className="bg-gray-800 border-t border-gray-600 rounded-t-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-600 rounded-full" />
            </div>
            <div className="px-4 pb-8">
              <p className="text-sm font-semibold text-center text-gray-200 mb-4">
                {deckCard.card?.name}
              </p>

              {/* Quantity row */}
              <div className="flex items-center justify-center gap-8 mb-4 py-3 bg-gray-700/50 rounded-xl">
                <button
                  onClick={(e) => { e.stopPropagation(); onQuantityChange?.(deckCard.id, deckCard.quantity - 1) }}
                  className="w-11 h-11 bg-gray-600 hover:bg-gray-500 active:bg-gray-400 rounded-full text-white text-2xl font-bold flex items-center justify-center"
                >
                  −
                </button>
                <span className="text-white font-mono text-xl w-8 text-center select-none">
                  {deckCard.quantity}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onQuantityChange?.(deckCard.id, deckCard.quantity + 1) }}
                  className="w-11 h-11 bg-gray-600 hover:bg-gray-500 active:bg-gray-400 rounded-full text-white text-2xl font-bold flex items-center justify-center"
                >
                  +
                </button>
              </div>

              {/* Remove */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove?.(deckCard.id); setMobileActionSheet(false) }}
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
                      onClick={(e) => { e.stopPropagation(); onSendToSection?.(deckCard.id, s); setMobileActionSheet(false) }}
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
                      onClick={(e) => { e.stopPropagation(); onAddToSection?.(deckCard.card_id, s); setMobileActionSheet(false) }}
                      className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Change Version */}
              {onChangeVersion && (
                <div className="border-t border-gray-700 mt-2 pt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleChangeVersionClick() }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                  >
                    Change Version
                  </button>
                </div>
              )}

              {/* View on Scryfall */}
              {deckCard.card?.scryfall_id && (
                <div className="border-t border-gray-700 mt-2 pt-2">
                  <a
                    href={`https://scryfall.com/card/${deckCard.card.scryfall_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 rounded-lg"
                    onClick={() => setMobileActionSheet(false)}
                  >
                    View on Scryfall ↗
                  </a>
                </div>
              )}

              <button
                onClick={() => setMobileActionSheet(false)}
                className="w-full mt-3 py-3 text-sm text-gray-400 text-center border-t border-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Version picker modal — portaled to body to escape stacking contexts */}
      {showVersionPicker && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 text-white"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowVersionPicker(false)
            }
          }}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-semibold mb-1">Change Version</h2>
            <p className="text-gray-400 text-sm mb-3">
              {deckCard.card?.name} — select a printing
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
                      if (v.id !== deckCard.card_id) {
                        onChangeVersion?.(deckCard.id, v.id)
                        setShowVersionPicker(false)
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
                onClick={() => setShowVersionPicker(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedVersionId && selectedVersionId !== deckCard.card_id) {
                    onChangeVersion?.(deckCard.id, selectedVersionId)
                  }
                  setShowVersionPicker(false)
                }}
                disabled={!selectedVersionId || selectedVersionId === deckCard.card_id}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium"
              >
                Change
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
