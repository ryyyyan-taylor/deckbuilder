import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import type { DeckCard, Card } from '../../hooks/useDeck'
import type { Game } from '../../lib/games'

interface TestPanelProps {
  deckCards: DeckCard[]
  game: Game
  onHoverCard?: (card: Card | null) => void
}

const CARD_WIDTH = 200
const HAND_SIZE = 7
const MIN_SLOT_WIDTH = 40

function buildShuffledDeck(deckCards: DeckCard[]): Card[] {
  const pool: Card[] = []
  for (const dc of deckCards) {
    if (dc.section === 'Mainboard' && dc.card) {
      for (let i = 0; i < dc.quantity; i++) {
        pool.push(dc.card)
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

type DrawState = { hand: Card[]; remaining: Card[] }
type DrawAction =
  | { type: 'DEAL'; hand: Card[]; remaining: Card[] }
  | { type: 'DRAW_ONE' }

function drawReducer(state: DrawState, action: DrawAction): DrawState {
  if (action.type === 'DEAL') return { hand: action.hand, remaining: action.remaining }
  if (state.remaining.length === 0) return state
  return { hand: [...state.hand, state.remaining[0]], remaining: state.remaining.slice(1) }
}

export function TestPanel({ deckCards, onHoverCard }: TestPanelProps) {
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [{ hand, remaining }, dispatch] = useReducer(drawReducer, { hand: [], remaining: [] })
  const initialDrawnRef = useRef(false)

  // Callback ref: fires when the element mounts (even if it renders after deckCards load)
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node)
  }, [])

  useEffect(() => {
    if (!containerEl) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [containerEl])

  // Draw initial hand once deckCards are available
  // Uses dispatch (not setState) to avoid react-hooks/set-state-in-effect lint rule
  useEffect(() => {
    if (initialDrawnRef.current || deckCards.length === 0) return
    initialDrawnRef.current = true
    const deck = buildShuffledDeck(deckCards)
    dispatch({ type: 'DEAL', hand: deck.slice(0, HAND_SIZE), remaining: deck.slice(HAND_SIZE) })
  }, [deckCards])

  const drawNewHand = () => {
    const deck = buildShuffledDeck(deckCards)
    dispatch({ type: 'DEAL', hand: deck.slice(0, HAND_SIZE), remaining: deck.slice(HAND_SIZE) })
  }

  const drawCard = () => {
    dispatch({ type: 'DRAW_ONE' })
  }

  const isMobileLayout = containerWidth > 0 && containerWidth < 640

  const n = hand.length
  const slotWidth =
    n <= 1 || containerWidth === 0
      ? CARD_WIDTH
      : Math.max(MIN_SLOT_WIDTH, Math.min(CARD_WIDTH, (containerWidth - CARD_WIDTH) / (n - 1)))
  const marginRight = slotWidth - CARD_WIDTH // 0 or negative when overlapping

  const mainboardCount = deckCards
    .filter((dc) => dc.section === 'Mainboard')
    .reduce((sum, dc) => sum + dc.quantity, 0)

  return (
    <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Test Hand{' '}
        <span className="text-gray-500">({mainboardCount} cards in pool)</span>
      </h3>

      {mainboardCount === 0 ? (
        <p className="text-gray-600 text-xs py-4">Add cards to Mainboard to test hands</p>
      ) : (
        <>
          {/* Hand display */}
          <div ref={containerRef} className="w-full mb-6">
            {isMobileLayout ? (
              // Mobile: vertical stacked layout (like deck stacks view)
              <div className="flex justify-center">
                <div className="w-[200px] flex flex-col">
                  {hand.map((card, i) => (
                    <div
                      key={i}
                      className={`relative ${i > 0 ? 'mt-[-247px]' : ''}`}
                      style={{ zIndex: i }}
                    >
                      {card.image_uris?.normal ? (
                        <img
                          src={card.image_uris.normal}
                          alt={card.name}
                          className="w-full rounded-lg shadow-lg"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-400 p-2 text-center">
                          {card.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Desktop: horizontal overlap layout
              <div className="flex" style={{ minHeight: '280px' }}>
                {hand.map((card, i) => (
                  <div
                    key={i}
                    className="relative shrink-0"
                    style={{
                      width: `${CARD_WIDTH}px`,
                      marginRight: i < hand.length - 1 ? `${marginRight}px` : '0',
                      zIndex: i,
                    }}
                    onMouseEnter={() => onHoverCard?.(card)}
                    onMouseLeave={() => onHoverCard?.(null)}
                  >
                    {card.image_uris?.normal ? (
                      <img
                        src={card.image_uris.normal}
                        alt={card.name}
                        className="w-full rounded-lg shadow-lg"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full aspect-[2.5/3.5] bg-gray-700 rounded-lg flex items-center justify-center text-xs text-gray-400 p-2 text-center">
                        {card.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={drawNewHand}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              New Hand
            </button>
            <button
              onClick={drawCard}
              disabled={remaining.length === 0}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm"
            >
              Draw
            </button>
            <span className="text-gray-500 text-xs">{remaining.length} cards remaining</span>
          </div>
        </>
      )}
    </div>
  )
}
