import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DeckCard } from '../../hooks/useDeck'
import { getCardType } from '../../lib/cards'

interface StatsPanelProps {
  deckCards: DeckCard[]
}

const COLORS = [
  { key: 'W', label: 'White', hex: '#e8dcc8' },
  { key: 'U', label: 'Blue', hex: '#4a90d9' },
  { key: 'B', label: 'Black', hex: '#9ca3af' },
  { key: 'R', label: 'Red', hex: '#e05252' },
  { key: 'G', label: 'Green', hex: '#4caf82' },
]

const TYPE_GROUPS = [
  { label: 'Creatures', types: ['Creature'], dot: 'bg-blue-500' },
  { label: 'Instants & Sorceries', types: ['Instant', 'Sorcery'], dot: 'bg-red-500' },
  { label: 'Artifacts', types: ['Artifact'], dot: 'bg-gray-400' },
  { label: 'Enchantments', types: ['Enchantment'], dot: 'bg-green-500' },
  { label: 'Planeswalkers', types: ['Planeswalker'], dot: 'bg-purple-500' },
  { label: 'Lands', types: ['Land'], dot: 'bg-yellow-600' },
  { label: 'Other', types: ['Battle', 'Other'], dot: 'bg-gray-600' },
]

function parseColorPips(manaCost: string | null): Record<string, number> {
  if (!manaCost) return {}
  const pips: Record<string, number> = {}
  for (const match of manaCost.matchAll(/\{([WUBRG])\}/g)) {
    const c = match[1]
    pips[c] = (pips[c] ?? 0) + 1
  }
  return pips
}

export function StatsPanel({ deckCards }: StatsPanelProps) {
  const nonLands = deckCards.filter((dc) => getCardType(dc.card?.type_line ?? null) !== 'Land')

  // Mana curve — non-land cards, buckets 0–6, then 7+
  const cmcData = Array.from({ length: 8 }, (_, i) => ({
    cmc: i < 7 ? String(i) : '7+',
    count: 0,
  }))
  for (const dc of nonLands) {
    const cmc = dc.card?.cmc ?? 0
    const bucket = Math.min(Math.floor(cmc), 7)
    cmcData[bucket].count += dc.quantity
  }

  // Color pips — non-land cards
  const pipTotals: Record<string, number> = {}
  for (const dc of nonLands) {
    const pips = parseColorPips(dc.card?.mana_cost ?? null)
    for (const [c, n] of Object.entries(pips)) {
      pipTotals[c] = (pipTotals[c] ?? 0) + n * dc.quantity
    }
  }
  const maxPips = Math.max(1, ...Object.values(pipTotals))
  const hasColors = Object.values(pipTotals).some((n) => n > 0)

  // Card type counts — all cards
  const typeCounts: Record<string, number> = {}
  for (const dc of deckCards) {
    const type = getCardType(dc.card?.type_line ?? null)
    typeCounts[type] = (typeCounts[type] ?? 0) + dc.quantity
  }
  const totalCards = deckCards.reduce((s, dc) => s + dc.quantity, 0)

  const typeGroups = TYPE_GROUPS.map((g) => ({
    ...g,
    count: g.types.reduce((s, t) => s + (typeCounts[t] ?? 0), 0),
  })).filter((g) => g.count > 0)

  if (totalCards === 0) {
    return (
      <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Stats</h3>
        <p className="text-gray-600 text-xs py-4">Add cards to see statistics</p>
      </div>
    )
  }

  return (
    <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">
        Stats <span className="text-gray-500">({totalCards})</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Mana curve */}
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-3">Mana Curve</h4>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={cmcData} margin={{ top: 0, right: 4, bottom: 0, left: -24 }}>
              <XAxis dataKey="cmc" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#93c5fd' }}
                formatter={(value) => [value, 'Cards']}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Color distribution */}
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-3">Color Distribution</h4>
          {hasColors ? (
            <div className="space-y-2.5">
              {COLORS.map(({ key, label, hex }) => {
                const count = pipTotals[key] ?? 0
                const pct = (count / maxPips) * 100
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12 shrink-0">{label}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%`, backgroundColor: hex }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-5 text-right shrink-0">{count || ''}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-xs">No colored mana costs</p>
          )}
        </div>

        {/* Card types */}
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-3">Card Types</h4>
          <div className="space-y-2">
            {typeGroups.map(({ label, count, dot }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                <span className="text-xs text-gray-400 flex-1">{label}</span>
                <span className="text-xs text-gray-300 font-medium tabular-nums">{count}</span>
                <span className="text-xs text-gray-600 w-8 text-right tabular-nums">
                  {Math.round((count / totalCards) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
