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
    delta: number
  ): Promise<boolean> => {
    const next = matchups.map((m) => {
      if (m.id !== matchupId) return m
      if (delta === 0) {
        return { ...m, entries: m.entries.filter((e) => e.card_name !== cardName) }
      }
      const idx = m.entries.findIndex((e) => e.card_name === cardName)
      const newEntry: SideboardGuideEntry = {
        id: idx >= 0 ? m.entries[idx].id : makeId(),
        matchup_id: matchupId,
        card_name: cardName,
        delta,
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
    for (const matchup of matchups) {
      const entry = matchup.entries.find(
        (e) => e.card_name.toLowerCase() === cardName.toLowerCase()
      )
      if (!entry) continue
      if (section === 'Mainboard' && entry.delta < 0 && Math.abs(entry.delta) > newQuantity) {
        conflicts.push(matchup.name)
      } else if (section === 'Sideboard' && entry.delta > 0 && entry.delta > newQuantity) {
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
