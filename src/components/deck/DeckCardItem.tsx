import { useState, useEffect, useRef } from 'react'
import type { DeckCard, Card } from '../../hooks/useDeck'
import { cardBackFaceUrl } from '../../lib/cards'

interface DeckCardItemProps {
  deckCard: DeckCard
  onQuantityChange?: (deckCardId: string, quantity: number) => void
  onRemove?: (deckCardId: string) => void
  onHoverCard?: (card: Card | null) => void
  sections?: string[]
  onSendToSection?: (deckCardId: string, targetSection: string) => void
  onAddToSection?: (cardId: string, targetSection: string) => void
  onRequestVersionPicker?: () => void
  onMobileTap?: () => void
  onActiveChange?: (active: boolean) => void
  readOnly?: boolean
  sizeByHeight?: boolean
}

export function DeckCardItem({ deckCard, onQuantityChange, onRemove, onHoverCard, sections, onSendToSection, onAddToSection, onRequestVersionPicker, onMobileTap, onActiveChange, readOnly, sizeByHeight }: DeckCardItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<'send' | 'add' | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const touchMoved = useRef(false)

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const otherSections = (sections ?? []).filter((s) => s !== deckCard.section)
  const isActive = expanded || !!contextMenu

  // Notify parent when active state changes.
  // onActiveChange is an inline function in DeckSection that changes every render;
  // omitting it is intentional — we only want this to fire when isActive changes.
  useEffect(() => {
    onActiveChange?.(isActive)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  // Close expanded/context menu on click outside or Escape
  useEffect(() => {
    if (!isActive) return

    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setExpanded(false)
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
        setContextMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isActive])

  // --- Touch handlers (mobile: short tap triggers onMobileTap) ---
  const handleTouchStart = () => { touchMoved.current = false }
  const handleTouchMove = () => { touchMoved.current = true }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchMoved.current && !readOnly) {
      e.preventDefault() // suppress synthetic click so it doesn't fire on action sheet buttons
      onMobileTap?.()
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly || isMobile) return
    e.preventDefault()
    if (otherSections.length === 0 && !onRequestVersionPicker) return
    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) {
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }

  const backUrl = deckCard.card ? cardBackFaceUrl(deckCard.card) : null
  const imageUrl = flipped && backUrl ? backUrl : deckCard.card?.image_uris?.normal

  // Pass a synthetic card to the preview pane reflecting the current face
  const hoverCard = deckCard.card
    ? (flipped && backUrl
        ? { ...deckCard.card, image_uris: { ...deckCard.card.image_uris, normal: backUrl } as typeof deckCard.card.image_uris }
        : deckCard.card)
    : null

  // In read-only mode only allow expanding if the card has a back face
  const canExpand = !isMobile && (!readOnly || !!backUrl)

  return (
    <div
      ref={cardRef}
      style={{
        zIndex: expanded || contextMenu ? 50 : undefined,
        position: 'relative' as const,
      }}
      className={`relative w-[200px] shrink-0 ${canExpand ? 'cursor-pointer' : ''}`}
      onClick={canExpand ? () => { setExpanded((prev) => !prev); setContextMenu(null) } : undefined}
      onContextMenu={handleContextMenu}
      onMouseEnter={isMobile ? undefined : () => onHoverCard?.(hoverCard)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {sizeByHeight ? (
        // Square container so portrait and landscape cards both render at the same
        // visual area (200×280 vs 280×200) with equal letterbox margins — no cropping.
        <div className="w-[280px] h-[280px] rounded-lg overflow-hidden bg-gray-800/40 flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={deckCard.card?.name ?? 'Card'}
              className="max-w-full max-h-full object-contain rounded-sm"
              draggable={false}
            />
          ) : (
            <span className="text-xs text-gray-400 p-2 text-center">{deckCard.card?.name ?? 'Unknown card'}</span>
          )}
        </div>
      ) : imageUrl ? (
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

      {/* Read-only flip overlay — only shown for DFC/leader cards */}
      {expanded && readOnly && !isMobile && backUrl && (
        <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setFlipped(f => !f)
              setExpanded(false)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            {flipped ? 'Front' : 'Back'}
          </button>
        </div>
      )}

      {/* Desktop: expanded overlay with controls */}
      {expanded && !readOnly && !isMobile && (
        <div className="absolute inset-0 bg-black/60 rounded-lg flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-1">
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
          {backUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFlipped(f => !f)
              }}
              title={flipped ? 'Show front face' : 'Show back face'}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              {flipped ? 'Front' : 'Back'}
            </button>
          )}
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
          {onRequestVersionPicker && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setContextMenu(null)
                setExpanded(false)
                onRequestVersionPicker()
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
  )
}
