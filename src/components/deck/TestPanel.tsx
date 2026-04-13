import { useState, useEffect, useRef } from 'react'
import type { DeckCard, Card } from '../../hooks/useDeck'

interface TestPanelProps {
  deckCards: DeckCard[]
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

export function TestPanel({ deckCards, onHoverCard }: TestPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [hand, setHand] = useState<Card[]>([])
  const [remaining, setRemaining] = useState<Card[]>([])
  const initialDrawnRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Draw initial hand once deckCards are available
  useEffect(() => {
    if (initialDrawnRef.current || deckCards.length === 0) return
    initialDrawnRef.current = true
    const deck = buildShuffledDeck(deckCards)
    setHand(deck.slice(0, HAND_SIZE))
    setRemaining(deck.slice(HAND_SIZE))
  }, [deckCards])

  const drawNewHand = () => {
    const deck = buildShuffledDeck(deckCards)
    setHand(deck.slice(0, HAND_SIZE))
    setRemaining(deck.slice(HAND_SIZE))
  }

  const drawCard = () => {
    if (remaining.length === 0) return
    setHand((prev) => [...prev, remaining[0]])
    setRemaining((prev) => prev.slice(1))
  }

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
          {/* Hand display — cards overlap as hand grows */}
          <div ref={containerRef} className="flex mb-6" style={{ minHeight: '280px' }}>
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
