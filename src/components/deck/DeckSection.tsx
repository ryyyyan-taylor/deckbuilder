import { useState } from 'react'
import type { DeckCard, Card } from '../../hooks/useDeck'
import { DeckCardItem } from './DeckCardItem'

export type SortBy = 'name' | 'cmc'

interface DeckSectionProps {
  section: string
  cards: DeckCard[]
  onQuantityChange?: (deckCardId: string, quantity: number) => void
  onRemove?: (deckCardId: string) => void
  onHoverCard?: (card: Card | null) => void
  sortBy: SortBy
  sections?: string[]
  onSendToSection?: (deckCardId: string, targetSection: string) => void
  onAddToSection?: (cardId: string, targetSection: string) => void
  onChangeVersion?: (deckCardId: string, newCardId: string) => void
  readOnly?: boolean
}

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Sorcery', 'Instant', 'Enchantment', 'Artifact', 'Land', 'Other']

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

function sortCards(cards: DeckCard[], sortBy: SortBy): DeckCard[] {
  return [...cards].sort((a, b) => {
    if (sortBy === 'cmc') {
      const cmcA = a.card?.cmc ?? 0
      const cmcB = b.card?.cmc ?? 0
      if (cmcA !== cmcB) return cmcA - cmcB
    }
    const nameA = a.card?.name ?? ''
    const nameB = b.card?.name ?? ''
    return nameA.localeCompare(nameB)
  })
}

export function DeckSection({ section, cards, onQuantityChange, onRemove, onHoverCard, sortBy, sections, onSendToSection, onAddToSection, onChangeVersion, readOnly }: DeckSectionProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const totalCards = cards.reduce((sum, dc) => sum + dc.quantity, 0)
  const isCommander = section === 'Commander'

  if (isCommander) {
    const sorted = sortCards(cards, 'name')
    return (
      <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">
          {section} <span className="text-gray-500">({totalCards})</span>
        </h3>

        {cards.length === 0 ? (
          <p className="text-gray-600 text-xs py-4">
            Add cards from search
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-4">
            {sorted.map((dc) => (
              <DeckCardItem
                key={dc.id}
                deckCard={dc}
                onQuantityChange={onQuantityChange}
                onRemove={onRemove}
                onHoverCard={onHoverCard}
                sections={sections}
                onSendToSection={onSendToSection}
                onAddToSection={onAddToSection}
                onChangeVersion={onChangeVersion}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Group cards by type
  const grouped = new Map<string, DeckCard[]>()
  for (const dc of cards) {
    const type = getCardType(dc.card?.type_line ?? null)
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type)!.push(dc)
  }

  // Sort groups by TYPE_ORDER, sort cards within each group
  const sortedGroups = TYPE_ORDER
    .filter((t) => grouped.has(t))
    .map((t) => ({ type: t, cards: sortCards(grouped.get(t)!, sortBy) }))

  return (
    <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">
        {section} <span className="text-gray-500">({totalCards})</span>
      </h3>

      {cards.length === 0 ? (
        <p className="text-gray-600 text-xs py-4">
          Add cards from search
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-10">
          {sortedGroups.map(({ type, cards: typeCards }) => {
            const typeCount = typeCards.reduce((s, dc) => s + dc.quantity, 0)
            return (
              <div key={type} className="w-[180px]">
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  {type} <span className="text-gray-600">({typeCount})</span>
                </h4>
                <div className="flex flex-col">
                  {typeCards.map((dc, i) => (
                    <div
                      key={dc.id}
                      className={`relative ${i > 0 ? 'mt-[-238px]' : ''}`}
                      style={{ zIndex: activeCardId === dc.id ? 100 : i }}
                    >
                      <DeckCardItem
                        deckCard={dc}
                        onQuantityChange={onQuantityChange}
                        onRemove={onRemove}
                        onHoverCard={onHoverCard}
                        sections={sections}
                        onSendToSection={onSendToSection}
                        onAddToSection={onAddToSection}
                        onChangeVersion={onChangeVersion}
                        onActiveChange={(active) => setActiveCardId(active ? dc.id : null)}
                        readOnly={readOnly}
                      />
                    </div>
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
