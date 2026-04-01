import { useEffect, useState } from 'react'

interface TournamentResult {
  tournament_name: string
  date: string
  player: string
  standing: number | null
  wins?: number
  losses?: number
  draws?: number
  decklist_url: string | null
  tournament_size: number | null
}

interface ResultsPanelProps {
  commanderName: string
  source: 'edhtop16' | 'mtgtop8'
  onClose: () => void
}

export function ResultsPanel({ commanderName, source, onClose }: ResultsPanelProps) {
  const [results, setResults] = useState<TournamentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/results/${source}?commander=${encodeURIComponent(commanderName)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFallbackUrl(data.fallback_url ?? data.search_url ?? null)
          throw new Error(data.error ?? `Failed (${res.status})`)
        }
        return data
      })
      .then((data) => {
        setResults(data.results ?? [])
        if (data.search_url) setFallbackUrl(data.search_url)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [commanderName, source])

  const title = source === 'edhtop16' ? 'EDHTop16 Results' : 'MTGTop8 Results'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-gray-400 text-sm">{commanderName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <p className="text-gray-400">Loading results...</p>}
          {error && (
            <div>
              <p className="text-red-400 mb-2">{error}</p>
              {fallbackUrl && (
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  Search manually on {source === 'edhtop16' ? 'EDHTop16' : 'MTGTop8'}
                </a>
              )}
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="text-gray-400">No tournament results found for this commander.</p>
          )}

          {results.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Player</th>
                  <th className="pb-2 pr-3">Tournament</th>
                  {source === 'edhtop16' && <th className="pb-2 pr-3">Record</th>}
                  <th className="pb-2 pr-3">Size</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2">Decklist</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-2 pr-3 text-gray-300">{r.standing ?? '—'}</td>
                    <td className="py-2 pr-3">{r.player}</td>
                    <td className="py-2 pr-3 text-gray-300 max-w-[200px] truncate">{r.tournament_name}</td>
                    {source === 'edhtop16' && (
                      <td className="py-2 pr-3 text-gray-400">
                        {r.wins ?? 0}-{r.losses ?? 0}{(r.draws ?? 0) > 0 ? `-${r.draws}` : ''}
                      </td>
                    )}
                    <td className="py-2 pr-3 text-gray-400">{r.tournament_size ?? '—'}</td>
                    <td className="py-2 pr-3 text-gray-400">{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                    <td className="py-2">
                      {r.decklist_url ? (
                        <a
                          href={r.decklist_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
