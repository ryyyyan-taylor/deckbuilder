import { useDroppable } from '@dnd-kit/core'
import type { DeckCard, Card } from '../../hooks/useDeck'
import { DraggableCard } from './DraggableCard'

interface DeckSectionProps {
  section: string
  cards: DeckCard[]
  onQuantityChange: (deckCardId: string, quantity: number) => void
  onRemove: (deckCardId: string) => void
  onHoverCard?: (card: Card | null) => void
}

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Battle', 'Other']

function getCardType(typeLine: string | null): string {
  if (!typeLine) return 'Other'
  const main = typeLine.split(' — ')[0]
  if (main.includes('Land')) return 'Land'
  if (main.includes('Creature')) return 'Creature'
  if (main.includes('Planeswalker')) return 'Planeswalker'
  if (main.includes('Battle')) return 'Battle'
  if (main.includes('Instant')) return 'Instant'
  if (main.includes('Sorcery')) return 'Sorcery'
  if (main.includes('Enchantment')) return 'Enchantment'
  if (main.includes('Artifact')) return 'Artifact'
  return 'Other'
}

export function DeckSection({ section, cards, onQuantityChange, onRemove, onHoverCard }: DeckSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: section })

  const totalCards = cards.reduce((sum, dc) => sum + dc.quantity, 0)

  // Group cards by type
  const grouped = new Map<string, DeckCard[]>()
  for (const dc of cards) {
    const type = getCardType(dc.card?.type_line ?? null)
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type)!.push(dc)
  }

  // Sort groups by TYPE_ORDER
  const sortedGroups = TYPE_ORDER
    .filter((t) => grouped.has(t))
    .map((t) => ({ type: t, cards: grouped.get(t)! }))

  return (
    <div
      ref={setNodeRef}
      className={`rounded border p-4 transition-colors ${
        isOver
          ? 'border-blue-500 bg-blue-900/20'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        {section} <span className="text-gray-500">({totalCards})</span>
      </h3>

      {cards.length === 0 ? (
        <p className="text-gray-600 text-xs py-4">
          {isOver ? 'Drop here' : 'Drag cards here or add from search'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-6">
          {sortedGroups.map(({ type, cards: typeCards }) => {
            const typeCount = typeCards.reduce((s, dc) => s + dc.quantity, 0)
            return (
              <div key={type} className="min-w-0">
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  {type} <span className="text-gray-600">({typeCount})</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {typeCards.map((dc) => (
                    <DraggableCard
                      key={dc.id}
                      deckCard={dc}
                      onQuantityChange={onQuantityChange}
                      onRemove={onRemove}
                      onHoverCard={onHoverCard}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
