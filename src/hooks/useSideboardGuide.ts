import { useState } from 'react'
import { supabase } from '../lib/supabase'

export interface SideboardGuideEntry {
  id: string
  matchup_id: string
  card_name: string
  // negative = out (mainboard), positive = in (sideboard)
  // null = not applicable for that mode
  delta_play: number | null
  delta_draw: number | null
}

export interface SideboardGuideMatchup {
  id: string
  deck_id: string
  name: string
  position: number
  entries: SideboardGuideEntry[]
}

export function useSideboardGuide() {
  const [matchups, setMatchups] = useState<SideboardGuideMatchup[]>([])
  const [loading, setLoading] = useState(false)

  const fetchGuide = async (deckId: string) => {
    setLoading(true)
    const { data: matchupData } = await supabase
      .from('sideboard_guide_matchups')
      .select('*')
      .eq('deck_id', deckId)
      .order('position')

    if (!matchupData || matchupData.length === 0) {
      setMatchups([])
      setLoading(false)
      return
    }

    const matchupIds = (matchupData as { id: string }[]).map((m) => m.id)
    const { data: entryData } = await supabase
      .from('sideboard_guide_entries')
      .select('*')
      .in('matchup_id', matchupIds)

    const entriesByMatchup = ((entryData ?? []) as SideboardGuideEntry[]).reduce<
      Record<string, SideboardGuideEntry[]>
    >((acc, e) => {
      if (!acc[e.matchup_id]) acc[e.matchup_id] = []
      acc[e.matchup_id].push(e)
      return acc
    }, {})

    setMatchups(
      (matchupData as SideboardGuideMatchup[]).map((m) => ({
        ...m,
        entries: entriesByMatchup[m.id] ?? [],
      }))
    )
    setLoading(false)
  }

  const addMatchup = async (deckId: string, name: string): Promise<SideboardGuideMatchup | null> => {
    const position = matchups.length
    const { data, error } = await supabase
      .from('sideboard_guide_matchups')
      .insert({ deck_id: deckId, name, position })
      .select()
      .single()
    if (error || !data) return null
    const newMatchup = { ...(data as SideboardGuideMatchup), entries: [] }
    setMatchups((prev) => [...prev, newMatchup])
    return newMatchup
  }

  const removeMatchup = async (matchupId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('sideboard_guide_matchups')
      .delete()
      .eq('id', matchupId)
    if (error) return false
    setMatchups((prev) => prev.filter((m) => m.id !== matchupId))
    return true
  }

  const renameMatchup = async (matchupId: string, name: string): Promise<boolean> => {
    const { error } = await supabase
      .from('sideboard_guide_matchups')
      .update({ name })
      .eq('id', matchupId)
    if (error) return false
    setMatchups((prev) => prev.map((m) => (m.id === matchupId ? { ...m, name } : m)))
    return true
  }

  const reorderMatchups = async (newOrder: SideboardGuideMatchup[]): Promise<void> => {
    setMatchups(newOrder)
    await Promise.all(
      newOrder.map((m, i) =>
        supabase.from('sideboard_guide_matchups').update({ position: i }).eq('id', m.id)
      )
    )
  }

  const setEntry = async (
    matchupId: string,
    cardName: string,
    deltaPlay: number | null,
    deltaDraw: number | null
  ): Promise<boolean> => {
    if (deltaPlay === null && deltaDraw === null) {
      const { error } = await supabase
        .from('sideboard_guide_entries')
        .delete()
        .eq('matchup_id', matchupId)
        .eq('card_name', cardName)
      if (error) return false
      setMatchups((prev) =>
        prev.map((m) =>
          m.id === matchupId
            ? { ...m, entries: m.entries.filter((e) => e.card_name !== cardName) }
            : m
        )
      )
    } else {
      const { data, error } = await supabase
        .from('sideboard_guide_entries')
        .upsert(
          { matchup_id: matchupId, card_name: cardName, delta_play: deltaPlay, delta_draw: deltaDraw },
          { onConflict: 'matchup_id,card_name' }
        )
        .select()
        .single()
      if (error || !data) return false
      const newEntry = data as SideboardGuideEntry
      setMatchups((prev) =>
        prev.map((m) => {
          if (m.id !== matchupId) return m
          const idx = m.entries.findIndex((e) => e.card_name === cardName)
          if (idx >= 0) {
            const updated = [...m.entries]
            updated[idx] = newEntry
            return { ...m, entries: updated }
          }
          return { ...m, entries: [...m.entries, newEntry] }
        })
      )
    }
    return true
  }

  // Returns list of matchup names where changing cardName to newQuantity would
  // break the guide (guide uses more copies than would be available).
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
      // Use the worst-case (largest absolute value across play/draw)
      const dp = entry.delta_play ?? 0
      const dd = entry.delta_draw ?? 0
      const maxOut = Math.min(dp, dd)   // most negative = most cards removed
      const maxIn  = Math.max(dp, dd)   // most positive = most cards added
      if (section === 'Mainboard' && maxOut < 0 && Math.abs(maxOut) > newQuantity) {
        conflicts.push(matchup.name)
      } else if (section === 'Sideboard' && maxIn > 0 && maxIn > newQuantity) {
        conflicts.push(matchup.name)
      }
    }
    return conflicts
  }

  return {
    matchups,
    loading,
    fetchGuide,
    addMatchup,
    removeMatchup,
    renameMatchup,
    reorderMatchups,
    setEntry,
    checkConflict,
  }
}
