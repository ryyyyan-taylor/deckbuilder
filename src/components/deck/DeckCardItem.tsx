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
  const cardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const otherSections = (sections ?? []).filter((s) => s !== deckCard.section)

  const isActive = expanded || !!contextMenu

  // Notify parent when active state changes
  useEffect(() => {
    onActiveChange?.(isActive)
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

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readOnly) return
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
    setActiveSubmenu(null)
    setVersionsLoading(true)
    setShowVersionPicker(true)
    setSelectedVersionId(deckCard.card_id)

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
        className={`relative w-[200px] shrink-0 ${readOnly ? '' : 'cursor-pointer'}`}
        onClick={readOnly ? undefined : () => { setExpanded((prev) => !prev); setContextMenu(null) }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => onHoverCard?.(deckCard.card ?? null)}
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

        {/* Expanded overlay with controls */}
        {expanded && !readOnly && (
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

        {/* Right-click context menu */}
        {contextMenu && !readOnly && (
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
          </div>
        )}
      </div>

      {/* Version picker modal — portaled to body to escape stacking contexts */}
      {showVersionPicker && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowVersionPicker(false)
            }
          }}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-semibold mb-1">Change Version</h2>
            <p className="text-gray-400 text-sm mb-4">
              {deckCard.card?.name} — select a printing
            </p>

            {versionsLoading ? (
              <p className="text-gray-400 text-sm py-8 text-center">Loading versions...</p>
            ) : (
              <div className="flex-1 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersionId(v.id)}
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
