import { useState } from 'react'
import type { SideboardGuideMatchup, SideboardGuideEntry } from './useSideboardGuide'

const STORAGE_KEY = 'sandbox_sideboard_guide'

function loadFromStorage(): SideboardGuideMatchup[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SideboardGuideMatchup[]) : []
  } catch {
    return []
  }
}

function saveToStorage(matchups: SideboardGuideMatchup[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(matchups))
  } catch {
    // ignore storage errors
  }
}

function makeId(): string {
  return crypto.randomUUID()
}

export function useSandboxSideboardGuide() {
  const [matchups, setMatchups] = useState<SideboardGuideMatchup[]>(() => loadFromStorage())

  const update = (next: SideboardGuideMatchup[]) => {
    setMatchups(next)
    saveToStorage(next)
  }

  const fetchGuide = async () => {
    setMatchups(loadFromStorage())
  }

  const addMatchup = async (_deckId: string, name: string): Promise<SideboardGuideMatchup | null> => {
    const newMatchup: SideboardGuideMatchup = {
      id: makeId(),
      deck_id: 'sandbox',
      name,
      position: matchups.length,
      entries: [],
    }
    update([...matchups, newMatchup])
    return newMatchup
  }

  const removeMatchup = async (matchupId: string): Promise<boolean> => {
    update(matchups.filter((m) => m.id !== matchupId))
    return true
  }

  const renameMatchup = async (matchupId: string, name: string): Promise<boolean> => {
    update(matchups.map((m) => (m.id === matchupId ? { ...m, name } : m)))
    return true
  }

  const reorderMatchups = async (newOrder: SideboardGuideMatchup[]): Promise<void> => {
    update(newOrder.map((m, i) => ({ ...m, position: i })))
  }

  const setEntry = async (
    matchupId: string,
    cardName: string,
    isOut: boolean,
    deltaPlay: number | null,
    deltaDraw: number | null
  ): Promise<boolean> => {
    const next = matchups.map((m) => {
      if (m.id !== matchupId) return m
      if (deltaPlay === null && deltaDraw === null) {
        return { ...m, entries: m.entries.filter((e) => !(e.card_name === cardName && e.is_out === isOut)) }
      }
      const idx = m.entries.findIndex((e) => e.card_name === cardName && e.is_out === isOut)
      const newEntry: SideboardGuideEntry = {
        id: idx >= 0 ? m.entries[idx].id : makeId(),
        matchup_id: matchupId,
        card_name: cardName,
        is_out: isOut,
        delta_play: deltaPlay,
        delta_draw: deltaDraw,
      }
      if (idx >= 0) {
        const updated = [...m.entries]
        updated[idx] = newEntry
        return { ...m, entries: updated }
      }
      return { ...m, entries: [...m.entries, newEntry] }
    })
    update(next)
    return true
  }

  const checkConflict = (
    cardName: string,
    section: 'Mainboard' | 'Sideboard',
    newQuantity: number
  ): string[] => {
    const conflicts: string[] = []
    const isOut = section === 'Mainboard'
    for (const matchup of matchups) {
      const entry = matchup.entries.find(
        (e) => e.card_name.toLowerCase() === cardName.toLowerCase() && e.is_out === isOut
      )
      if (!entry) continue
      const dp = entry.delta_play ?? 0
      const dd = entry.delta_draw ?? 0
      const maxOut = Math.min(dp, dd)
      const maxIn  = Math.max(dp, dd)
      if (section === 'Mainboard' && maxOut < 0 && Math.abs(maxOut) > newQuantity) {
        conflicts.push(matchup.name)
      } else if (section === 'Sideboard' && maxIn > 0 && maxIn > newQuantity) {
        conflicts.push(matchup.name)
      }
    }
    return conflicts
  }

  const clearGuide = () => {
    update([])
  }

  return {
    matchups,
    loading: false,
    fetchGuide,
    addMatchup,
    removeMatchup,
    renameMatchup,
    reorderMatchups,
    setEntry,
    checkConflict,
    clearGuide,
  }
}
