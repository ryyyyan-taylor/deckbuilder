import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DeckCard } from '../../hooks/useDeck'
import type { Game } from '../../lib/games'
import { getCardType } from '../../lib/cards'

interface StatsPanelProps {
  deckCards: DeckCard[]
  game: Game
  // Union color identity of all commander cards — when provided, colors outside
  // the identity are dimmed (like Moxfield does for Commander format decks).
  commanderColorIdentity?: string[]
}

const COLORS = [
  { key: 'W', label: 'White', hex: '#c9b58a' },
  { key: 'U', label: 'Blue', hex: '#3b82f6' },
  { key: 'B', label: 'Black', hex: '#9ca3af' },
  { key: 'R', label: 'Red', hex: '#ef4444' },
  { key: 'G', label: 'Green', hex: '#22c55e' },
  { key: 'C', label: 'Colorless', hex: '#8b5cf6' },
]

function parseColorPips(manaCost: string | null): Record<string, number> {
  if (!manaCost) return {}
  const pips: Record<string, number> = {}
  // Include {C} (explicit colorless pip, e.g. Eldrazi) as well as colored pips
  for (const match of manaCost.matchAll(/\{([WUBRGC])\}/g)) {
    const c = match[1]
    pips[c] = (pips[c] ?? 0) + 1
  }
  return pips
}

// Parse a land's oracle_text to determine what colors it can produce.
// Uses oracle text instead of color_identity so fixing lands (Command Tower,
// City of Brass, Mana Confluence) are correctly counted as colored production.
function parseLandProduction(oracleText: string | null): string[] {
  if (!oracleText) return ['C']
  // "Add one mana of any color" / "any color in your commander's color identity"
  if (/add[^.]*any[^.]*color/i.test(oracleText)) return ['W', 'U', 'B', 'R', 'G']
  // Extract mana symbols from "Add ..." clauses (e.g. "Add {U}", "Add {W} or {B}")
  const colors = new Set<string>()
  for (const m of oracleText.matchAll(/add[^.;]+/gi)) {
    for (const sym of m[0].matchAll(/\{([WUBRGC])\}/g)) {
      colors.add(sym[1])
    }
  }
  return colors.size > 0 ? [...colors] : ['C']
}

export function StatsPanel({ deckCards, game, commanderColorIdentity }: StatsPanelProps) {
  // For SWU, show cost curve + aspect pips. For MTG, show mana curve + color pips + land production.
  // Phase 8 will split this into StatsPanelMtg and StatsPanelSwu; for now, MTG-only.
  if (game === 'swu') {
    return <div className="text-sm text-gray-500 p-4">SWU stats coming in Phase 8</div>
  }

  const mainboard = deckCards.filter((dc) => dc.section === 'Mainboard')
  const lands = mainboard.filter((dc) => getCardType(dc.card ?? {}, game) === 'Land')
  const nonLands = mainboard.filter((dc) => getCardType(dc.card ?? {}, game) !== 'Land')

  const totalMainboard = mainboard.reduce((s, dc) => s + dc.quantity, 0)
  const totalNonLands = nonLands.reduce((s, dc) => s + dc.quantity, 0)
  const totalLands = lands.reduce((s, dc) => s + dc.quantity, 0)

  // Pip demand from non-land mainboard cards
  const pipsByColor: Record<string, number> = {}
  // Quantity-weighted count of non-land copies with ≥1 pip of each color
  // (matches Moxfield's primary large % — "what fraction of spells need this color")
  const cardsByColor: Record<string, number> = {}
  // Copies with no colored pips at all (pure artifacts, colorless spells)
  let colorlessNonLandCount = 0

  for (const dc of nonLands) {
    const pips = parseColorPips(dc.card?.mana_cost ?? null)
    let hasColoredPip = false
    for (const [c, n] of Object.entries(pips)) {
      pipsByColor[c] = (pipsByColor[c] ?? 0) + n * dc.quantity
      if (c !== 'C') {
        cardsByColor[c] = (cardsByColor[c] ?? 0) + dc.quantity
        hasColoredPip = true
      }
    }
    if (!hasColoredPip) {
      colorlessNonLandCount += dc.quantity
    }
  }
  const totalPips = Object.values(pipsByColor).reduce((s, n) => s + n, 0)

  // Mana production from lands — parse oracle_text for accuracy.
  // color_identity is wrong for Command Tower, City of Brass, etc. which have []
  // but produce colored mana.
  const productionByColor: Record<string, number> = {}
  for (const dc of lands) {
    const colors = parseLandProduction(dc.card?.oracle_text ?? null)
    for (const c of colors) {
      productionByColor[c] = (productionByColor[c] ?? 0) + dc.quantity
    }
  }

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

      {/* Color breakdown */}
      <div>
        <div className="grid grid-cols-6 gap-3">
          {COLORS.map(({ key, label, hex }) => {
            const pipDemand = pipsByColor[key] ?? 0
            // Primary: % of non-land cards that require this color (or are colorless)
            const cards = key === 'C' ? colorlessNonLandCount : (cardsByColor[key] ?? 0)
            const cardPct = totalNonLands > 0 ? Math.round((cards / totalNonLands) * 100) : 0
            // Secondary: share of all pips
            const pipPct = totalPips > 0 ? Math.round((pipDemand / totalPips) * 100) : 0
            // Production
            const production = productionByColor[key] ?? 0
            const productionPct = totalLands > 0 ? Math.round((production / totalLands) * 100) : 0
            const isActive = cardPct > 0 || productionPct > 0
            const needsColor = cardPct > 0 && productionPct === 0
            // Dim colors outside the commander's color identity (when known)
            const offIdentity = commanderColorIdentity != null
              && !commanderColorIdentity.includes(key)
            const dimmed = offIdentity || (!isActive && !commanderColorIdentity)

            return (
              <div
                key={key}
                className={`flex flex-col items-center gap-1 min-w-0 transition-opacity ${dimmed ? 'opacity-25' : ''}`}
              >
                {/* Symbol + label */}
                <img
                  src={`https://svgs.scryfall.io/card-symbols/${key}.svg`}
                  alt={label}
                  className="w-7 h-7 shrink-0"
                />
                <div className="text-[10px] text-gray-500 leading-none">{label}</div>

                {/* Primary: % of spells */}
                <div className="text-center mt-1">
                  <div
                    className="text-2xl font-bold leading-none tabular-nums"
                    style={{ color: isActive && !offIdentity ? hex : '#6b7280' }}
                  >
                    {cardPct}%
                  </div>
                  <div className="text-[10px] text-gray-600 mt-0.5 leading-none">of spells</div>
                </div>

                {/* Secondary: pip share (skip for colorless — no colored pips) */}
                <div className="text-[10px] text-gray-600 leading-none text-center h-7 flex flex-col justify-center">
                  {key !== 'C' && pipDemand > 0 ? (
                    <>
                      <span>{pipPct}% of pips</span>
                      <span className="text-gray-700">{pipDemand} {pipDemand === 1 ? 'pip' : 'pips'}</span>
                    </>
                  ) : key === 'C' && pipDemand > 0 ? (
                    <span>{pipDemand} {pipDemand === 1 ? 'pip' : 'pips'}</span>
                  ) : null}
                </div>

                {/* Production bar */}
                <div className="w-full space-y-1 mt-1">
                  <div className="w-full bg-gray-700/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${productionPct}%`, backgroundColor: hex }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] text-gray-600 tabular-nums">
                      {production}/{totalLands}
                    </span>
                    <span
                      className="text-[9px] tabular-nums font-medium"
                      style={{ color: needsColor ? '#ef4444' : productionPct > 0 && productionPct < cardPct ? '#f59e0b' : '#6b7280' }}
                    >
                      {productionPct}%
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-gray-700 mt-3 text-center">
          Percentages will not add up to 100% for multi-color cards &middot; Mainboard only
        </p>
      </div>

      {/* Mana curve */}
      {totalNonLands > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-2">Mana Curve</h4>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={cmcData} margin={{ top: 0, right: 4, bottom: 0, left: -24 }}>
              <XAxis dataKey="cmc" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }}
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
