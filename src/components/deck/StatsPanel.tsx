import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DeckCard } from '../../hooks/useDeck'
import { getCardType } from '../../lib/cards'

interface StatsPanelProps {
  deckCards: DeckCard[]
}

const COLORS = [
  { key: 'W', label: 'White', hex: '#c9b58a' },
  { key: 'U', label: 'Blue', hex: '#3b82f6' },
  { key: 'B', label: 'Black', hex: '#6b7280' },
  { key: 'R', label: 'Red', hex: '#ef4444' },
  { key: 'G', label: 'Green', hex: '#22c55e' },
  { key: 'C', label: 'Colorless', hex: '#8b5cf6' },
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
  const mainboard = deckCards.filter((dc) => dc.section === 'Mainboard')
  const lands = mainboard.filter((dc) => getCardType(dc.card?.type_line ?? null) === 'Land')
  const nonLands = mainboard.filter((dc) => getCardType(dc.card?.type_line ?? null) !== 'Land')

  const totalMainboard = mainboard.reduce((s, dc) => s + dc.quantity, 0)

  // Pip demand from non-land mainboard cards
  const pipsByColor: Record<string, number> = {}
  for (const dc of nonLands) {
    const pips = parseColorPips(dc.card?.mana_cost ?? null)
    for (const [c, n] of Object.entries(pips)) {
      pipsByColor[c] = (pipsByColor[c] ?? 0) + n * dc.quantity
    }
  }
  const totalPips = Object.values(pipsByColor).reduce((s, n) => s + n, 0)

  // Mana production from land mainboard cards (by color_identity)
  const productionByColor: Record<string, number> = {}
  let colorlessLandQty = 0
  for (const dc of lands) {
    const ci = dc.card?.color_identity ?? []
    if (ci.length === 0) {
      colorlessLandQty += dc.quantity
    } else {
      for (const c of ci) {
        productionByColor[c] = (productionByColor[c] ?? 0) + dc.quantity
      }
    }
  }
  const totalLands = lands.reduce((s, dc) => s + dc.quantity, 0)

  // Mana curve (non-land mainboard, buckets 0–7+)
  const cmcData = Array.from({ length: 8 }, (_, i) => ({
    cmc: i < 7 ? String(i) : '7+',
    count: 0,
  }))
  for (const dc of nonLands) {
    const cmc = dc.card?.cmc ?? 0
    const bucket = Math.min(Math.floor(cmc), 7)
    cmcData[bucket].count += dc.quantity
  }

  const anyDemand = totalPips > 0

  if (totalMainboard === 0) {
    return (
      <div className="rounded border p-4 border-gray-700 bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Stats</h3>
        <p className="text-gray-600 text-xs py-4">Add cards to the Mainboard to see statistics</p>
      </div>
    )
  }

  return (
    <div className="rounded border p-4 border-gray-700 bg-gray-800/50 space-y-5">
      <h3 className="text-sm font-semibold text-gray-300">
        Stats <span className="text-gray-500">({totalMainboard})</span>
      </h3>

      {/* Color pip demand vs mana production */}
      <div>
        <div className="grid grid-cols-6 gap-2">
          {COLORS.map(({ key, label, hex }) => {
            const demand = key === 'C' ? 0 : (pipsByColor[key] ?? 0)
            const production = key === 'C' ? colorlessLandQty : (productionByColor[key] ?? 0)
            const demandPct = totalPips > 0 ? Math.round((demand / totalPips) * 100) : 0
            const productionPct = totalLands > 0 ? Math.round((production / totalLands) * 100) : 0

            return (
              <div key={key} className="flex flex-col items-center gap-1.5 min-w-0">
                {/* Color symbol */}
                <img
                  src={`https://svgs.scryfall.io/card-symbols/${key}.svg`}
                  alt={label}
                  className="w-8 h-8 shrink-0"
                />

                {/* Pip demand */}
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-100 leading-tight">{demandPct}%</div>
                  <div className="text-[10px] text-gray-500 leading-tight whitespace-nowrap">of all pips</div>
                </div>

                {/* Demand count */}
                {anyDemand && (
                  <div className="text-[10px] text-gray-500 tabular-nums">
                    {key === 'C' ? '—' : `${demand} pip${demand !== 1 ? 's' : ''}`}
                  </div>
                )}

                {/* Mana production bar */}
                <div className="w-full space-y-1">
                  <div className="text-[10px] text-gray-400 text-center leading-tight">{label}</div>
                  <div className="text-[10px] text-gray-400 text-center leading-tight">production</div>
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-300"
                      style={{ width: `${productionPct}%`, backgroundColor: hex }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-500 text-center tabular-nums leading-tight">
                    {production}/{totalLands} lands
                  </div>
                  <div className="text-[10px] text-center leading-tight font-medium"
                    style={{ color: productionPct === 0 && demandPct > 0 ? '#ef4444' : productionPct < demandPct ? '#f59e0b' : '#6b7280' }}>
                    {productionPct}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-gray-600 mt-3 text-center">
          Percentages will not add up to 100% for multi-color cards &middot; Mainboard only
        </p>
      </div>

      {/* Mana curve */}
      {anyDemand && (
        <div>
          <h4 className="text-xs font-medium text-gray-400 mb-2">Mana Curve</h4>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={cmcData} margin={{ top: 0, right: 4, bottom: 0, left: -24 }}>
              <XAxis dataKey="cmc" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: '#e5e7eb' }}
                itemStyle={{ color: '#93c5fd' }}
                formatter={(value) => [value, 'Cards']}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
