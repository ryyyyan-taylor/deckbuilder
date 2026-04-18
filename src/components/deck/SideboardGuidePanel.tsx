import { useState, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DeckCard } from '../../hooks/useDeck'
import type { SideboardGuideEntry, SideboardGuideMatchup } from '../../hooks/useSideboardGuide'

export interface SideboardGuidePanelProps {
  matchups: SideboardGuideMatchup[]
  loading: boolean
  mainboardCards: DeckCard[]
  sideboardCards: DeckCard[]
  isEditable: boolean
  onAddMatchup: (name: string) => Promise<SideboardGuideMatchup | null>
  onRemoveMatchup: (matchupId: string) => Promise<boolean>
  onRenameMatchup: (matchupId: string, name: string) => Promise<boolean>
  onReorderMatchups: (newOrder: SideboardGuideMatchup[]) => Promise<void>
  onSetEntry: (matchupId: string, cardName: string, deltaPlay: number | null, deltaDraw: number | null) => Promise<boolean>
}

type CellMode = 'both' | 'play' | 'draw' | 'independent'

function deriveCellMode(deltaPlay: number | null, deltaDraw: number | null): CellMode {
  if (deltaPlay !== null && deltaDraw !== null) return deltaPlay === deltaDraw ? 'both' : 'independent'
  if (deltaPlay !== null) return 'play'
  if (deltaDraw !== null) return 'draw'
  return 'both'
}

// ── Sortable matchup column header ──────────────────────────────────────────

interface SortableHeaderProps {
  matchup: SideboardGuideMatchup
  isEditing: boolean
  isRenaming: boolean
  renameValue: string
  onRenameStart: () => void
  onRenameChange: (v: string) => void
  onRenameSave: () => void
  onRenameCancel: () => void
  onRemove: () => void
}

function SortableMatchupHeader({
  matchup, isEditing, isRenaming, renameValue,
  onRenameStart, onRenameChange, onRenameSave, onRenameCancel, onRemove,
}: SortableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: matchup.id,
    disabled: !isEditing,
  })
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [isRenaming])

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform ? { ...transform, y: 0 } : null),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="w-28 shrink-0 border-l border-gray-700 px-2 py-2 bg-gray-800"
    >
      {isEditing ? (
        <div className="flex items-center gap-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-500 hover:text-gray-400 select-none shrink-0 touch-none text-base leading-none"
            aria-label="Drag to reorder"
          >
            ⠿
          </button>
          {isRenaming ? (
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSave()
                if (e.key === 'Escape') onRenameCancel()
              }}
              className="flex-1 text-xs bg-gray-700 border border-blue-500 rounded px-1 py-0.5 focus:outline-none min-w-0"
            />
          ) : (
            <span
              className="flex-1 text-xs text-gray-200 truncate cursor-text"
              onClick={onRenameStart}
              title={`Click to rename "${matchup.name}"`}
            >
              {matchup.name}
            </span>
          )}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            className="shrink-0 text-gray-600 hover:text-red-400 text-sm leading-none ml-0.5"
            aria-label={`Remove ${matchup.name}`}
          >
            ×
          </button>
        </div>
      ) : (
        <span className="block text-xs text-gray-300 text-center truncate" title={matchup.name}>
          {matchup.name}
        </span>
      )}
    </div>
  )
}

// ── Individual grid cell ─────────────────────────────────────────────────────

interface CellProps {
  matchupId: string
  cardName: string
  isOut: boolean
  deltaPlay: number | null
  deltaDraw: number | null
  isEditing: boolean
  isActive: boolean
  activeMode: CellMode
  cellValuePlay: string
  cellValueDraw: string
  menuOpenFor: { matchupId: string; cardName: string } | null
  onActivate: () => void
  onCellChangePlay: (v: string) => void
  onCellChangeDraw: (v: string) => void
  onCellSave: () => void
  onCellCancel: () => void
  onMenuOpen: () => void
  onMenuClose: () => void
  onModeChange: (mode: CellMode) => void
  onClear: () => void
}

function GuideCell({
  isOut, deltaPlay, deltaDraw,
  isEditing, isActive, activeMode,
  cellValuePlay, cellValueDraw,
  menuOpenFor, matchupId, cardName,
  onActivate, onCellChangePlay, onCellChangeDraw, onCellSave, onCellCancel,
  onMenuOpen, onMenuClose, onModeChange, onClear,
}: CellProps) {
  const inputPlayRef = useRef<HTMLInputElement>(null)
  const inputDrawRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive) {
      if (activeMode === 'draw') inputDrawRef.current?.focus()
      else { inputPlayRef.current?.focus(); inputPlayRef.current?.select() }
    }
  }, [isActive, activeMode])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenFor) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onMenuClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenFor, onMenuClose])

  const colorClass = isOut ? 'text-red-400 font-medium' : 'text-green-400 font-medium'
  const isMenuOpen = menuOpenFor?.matchupId === matchupId && menuOpenFor?.cardName === cardName
  const currentMode = deriveCellMode(deltaPlay, deltaDraw)
  const hasValue = deltaPlay !== null || deltaDraw !== null

  // Render the read-only value display
  const renderValue = () => {
    if (!hasValue) {
      return isEditing ? <span className="text-gray-700 select-none">–</span> : null
    }
    const absP = deltaPlay !== null ? Math.abs(deltaPlay) : null
    const absD = deltaDraw !== null ? Math.abs(deltaDraw) : null

    if (currentMode === 'both') {
      return <span className={colorClass}>{absP}</span>
    }
    if (currentMode === 'play') {
      return (
        <span className={colorClass}>
          {absP}<span className="text-[10px] ml-0.5 opacity-75">P</span>
        </span>
      )
    }
    if (currentMode === 'draw') {
      return (
        <span className={colorClass}>
          {absD}<span className="text-[10px] ml-0.5 opacity-75">D</span>
        </span>
      )
    }
    // independent
    return (
      <span className="flex items-center justify-center gap-1">
        <span className={colorClass}>
          {absP}<span className="text-[10px] opacity-75">P</span>
        </span>
        <span className="text-gray-600 text-[10px]">/</span>
        <span className={colorClass}>
          {absD}<span className="text-[10px] opacity-75">D</span>
        </span>
      </span>
    )
  }

  return (
    <div
      className={`w-28 shrink-0 border-l border-gray-800 px-2 py-1.5 text-center text-sm relative
        ${isEditing && !isActive ? 'cursor-pointer hover:bg-gray-700/40' : ''}
      `}
      onClick={() => {
        if (isEditing && !isActive && !isMenuOpen) onActivate()
      }}
    >
      {isActive ? (
        activeMode === 'independent' ? (
          <div className="flex items-center gap-1">
            <div className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-gray-500 leading-none">P</span>
              <input
                ref={inputPlayRef}
                type="number"
                min={0}
                max={9}
                value={cellValuePlay}
                onChange={(e) => onCellChangePlay(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCellSave()
                  if (e.key === 'Escape') onCellCancel()
                }}
                className="w-full text-center bg-gray-700 border border-blue-500 rounded text-xs focus:outline-none px-0.5 py-0"
              />
            </div>
            <div className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-gray-500 leading-none">D</span>
              <input
                ref={inputDrawRef}
                type="number"
                min={0}
                max={9}
                value={cellValueDraw}
                onChange={(e) => onCellChangeDraw(e.target.value)}
                onBlur={onCellSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCellSave()
                  if (e.key === 'Escape') onCellCancel()
                }}
                className="w-full text-center bg-gray-700 border border-blue-500 rounded text-xs focus:outline-none px-0.5 py-0"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            {activeMode !== 'both' && (
              <span className="text-[9px] text-gray-500 leading-none">
                {activeMode === 'play' ? 'P' : 'D'}
              </span>
            )}
            <input
              ref={inputPlayRef}
              type="number"
              min={0}
              max={9}
              value={cellValuePlay}
              onChange={(e) => onCellChangePlay(e.target.value)}
              onBlur={onCellSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCellSave()
                if (e.key === 'Escape') onCellCancel()
              }}
              className="w-full text-center bg-gray-700 border border-blue-500 rounded text-sm focus:outline-none px-1 py-0"
            />
          </div>
        )
      ) : (
        <>
          {renderValue()}
          {/* 3-dots menu button — only on populated cells in edit mode */}
          {isEditing && hasValue && (
            <div className="absolute top-0.5 right-0.5" ref={menuRef}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isMenuOpen) onMenuClose()
                  else onMenuOpen()
                }}
                className="text-gray-600 hover:text-gray-300 text-xs leading-none px-0.5 rounded hover:bg-gray-700"
                aria-label="Cell options"
              >
                ⋯
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-0.5 z-30 bg-gray-800 border border-gray-600 rounded shadow-lg text-xs w-28 py-0.5">
                  {(['both', 'play', 'draw', 'independent'] as CellMode[]).map((m) => (
                    <button
                      key={m}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onModeChange(m)
                      }}
                      className={`w-full text-left px-3 py-1 hover:bg-gray-700 capitalize
                        ${currentMode === m ? 'text-blue-400' : 'text-gray-300'}
                      `}
                    >
                      {m === 'both' ? 'Both' : m === 'play' ? 'Play only' : m === 'draw' ? 'Draw only' : 'Independent'}
                      {currentMode === m && ' ✓'}
                    </button>
                  ))}
                  <div className="border-t border-gray-700 my-0.5" />
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onClear()
                      onMenuClose()
                    }}
                    className="w-full text-left px-3 py-1 hover:bg-gray-700 text-gray-500 hover:text-red-400"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function SideboardGuidePanel({
  matchups: propMatchups,
  loading,
  mainboardCards,
  sideboardCards,
  isEditable,
  onAddMatchup,
  onRemoveMatchup,
  onRenameMatchup,
  onReorderMatchups,
  onSetEntry,
}: SideboardGuidePanelProps) {
  const [view, setView] = useState<'summary' | 'grid'>('summary')
  const [isEditing, setIsEditing] = useState(false)
  // Local matchup order for optimistic dnd reorder
  const [localMatchups, setLocalMatchups] = useState<SideboardGuideMatchup[]>(propMatchups)
  const [addingName, setAddingName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingCell, setEditingCell] = useState<{
    matchupId: string
    cardName: string
    isOut: boolean
  } | null>(null)
  const [activeCellMode, setActiveCellMode] = useState<CellMode>('both')
  const [cellValuePlay, setCellValuePlay] = useState('')
  const [cellValueDraw, setCellValueDraw] = useState('')
  const [menuCell, setMenuCell] = useState<{ matchupId: string; cardName: string } | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  // Keep local in sync when prop changes (after DB operations)
  useEffect(() => {
    setLocalMatchups(propMatchups)
  }, [propMatchups])

  useEffect(() => {
    if (addingName !== null && addInputRef.current) addInputRef.current.focus()
  }, [addingName])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localMatchups.findIndex((m) => m.id === active.id)
    const newIndex = localMatchups.findIndex((m) => m.id === over.id)
    const reordered = arrayMove(localMatchups, oldIndex, newIndex)
    setLocalMatchups(reordered)
    void onReorderMatchups(reordered)
  }

  const handleAddMatchup = async () => {
    const name = addingName?.trim()
    if (!name) { setAddingName(null); return }
    setAddingName(null)
    await onAddMatchup(name)
  }

  const handleRenameSave = async (matchupId: string) => {
    const name = renameValue.trim()
    setRenamingId(null)
    if (name) await onRenameMatchup(matchupId, name)
  }

  // Helper: apply sign based on row type
  const signed = (abs: number, isOut: boolean) => isOut ? -abs : abs

  // Save currently editing cell
  const flushCell = async () => {
    if (!editingCell) return
    const { matchupId, cardName, isOut } = editingCell
    const mode = activeCellMode

    const parseVal = (v: string): number | null => {
      const n = parseInt(v, 10)
      return isNaN(n) || n <= 0 ? null : signed(n, isOut)
    }

    let dp: number | null = null
    let dd: number | null = null

    if (mode === 'both') {
      const v = parseVal(cellValuePlay)
      dp = v; dd = v
    } else if (mode === 'play') {
      dp = parseVal(cellValuePlay)
    } else if (mode === 'draw') {
      // draw-only mode reuses the single "play" input slot (inputPlayRef)
      dd = parseVal(cellValuePlay)
    } else {
      // independent
      dp = parseVal(cellValuePlay)
      dd = parseVal(cellValueDraw)
    }

    setEditingCell(null)
    await onSetEntry(matchupId, cardName, dp, dd)
  }

  const activateCell = (
    matchupId: string, cardName: string, isOut: boolean,
    deltaPlay: number | null, deltaDraw: number | null,
    forceMode?: CellMode
  ) => {
    if (editingCell) void flushCell()
    const mode = forceMode ?? deriveCellMode(deltaPlay, deltaDraw)
    setActiveCellMode(mode)
    setEditingCell({ matchupId, cardName, isOut })
    const absP = deltaPlay !== null ? String(Math.abs(deltaPlay)) : ''
    const absD = deltaDraw !== null ? String(Math.abs(deltaDraw)) : ''
    // Single-input modes (both/play/draw) use the play input slot
    setCellValuePlay(mode === 'draw' ? absD : (absP || absD))
    // Independent mode also populates the draw input
    setCellValueDraw(absD)
  }

  // Handle mode change from 3-dots menu (immediate save, no editing needed)
  const handleModeChange = async (
    matchupId: string, cardName: string, isOut: boolean,
    newMode: CellMode,
    deltaPlay: number | null, deltaDraw: number | null
  ) => {
    setMenuCell(null)
    if (newMode === 'independent') {
      // Activate for editing in independent mode
      activateCell(matchupId, cardName, isOut, deltaPlay, deltaDraw, 'independent')
      return
    }
    // For other modes, derive the new play/draw values and save immediately
    const existing = deltaPlay ?? deltaDraw ?? 0
    let dp: number | null = null
    let dd: number | null = null
    if (newMode === 'both') {
      dp = existing !== 0 ? existing : null
      dd = dp
    } else if (newMode === 'play') {
      dp = deltaPlay ?? deltaDraw ?? null
    } else if (newMode === 'draw') {
      dd = deltaDraw ?? deltaPlay ?? null
    }
    if (dp === null && dd === null) return // no-op if nothing to save
    await onSetEntry(matchupId, cardName, dp, dd)
  }

  // ── Derived card lists ───────────────────────────────────────────────────

  // Deduplicated names, alphabetical
  const mainNames = [...new Set(
    mainboardCards.map((dc) => dc.card?.name ?? '').filter(Boolean)
  )].sort()
  const sideNames = [...new Set(
    sideboardCards.map((dc) => dc.card?.name ?? '').filter(Boolean)
  )].sort()

  // In read mode: only show cards that appear in at least one matchup entry
  const isOutEntry = (e: SideboardGuideEntry) =>
    (e.delta_play !== null && e.delta_play < 0) || (e.delta_draw !== null && e.delta_draw < 0)
  const isInEntry = (e: SideboardGuideEntry) =>
    (e.delta_play !== null && e.delta_play > 0) || (e.delta_draw !== null && e.delta_draw > 0)

  const outNames = isEditing
    ? mainNames
    : [...new Set(
        localMatchups.flatMap((m) => m.entries.filter(isOutEntry).map((e) => e.card_name))
      )].sort()

  const inNames = isEditing
    ? sideNames
    : [...new Set(
        localMatchups.flatMap((m) => m.entries.filter(isInEntry).map((e) => e.card_name))
      )].sort()

  // Helper: get entry deltas for a card in a matchup
  const getEntry = (matchupId: string, cardName: string) => {
    return localMatchups
      .find((m) => m.id === matchupId)
      ?.entries.find((e) => e.card_name.toLowerCase() === cardName.toLowerCase()) ?? null
  }

  const isEmpty = localMatchups.length === 0

  // Format a single entry for summary display
  const formatEntryText = (e: SideboardGuideEntry): string => {
    const dp = e.delta_play
    const dd = e.delta_draw
    const fmt = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`
    if (dp !== null && dd !== null && dp === dd) return `${fmt(dp)} ${e.card_name}`
    if (dp !== null && dd !== null) return `${fmt(dp)}P/${fmt(dd)}D ${e.card_name}`
    if (dp !== null) return `${fmt(dp)}P ${e.card_name}`
    if (dd !== null) return `${fmt(dd)}D ${e.card_name}`
    return e.card_name
  }

  // ── Summary view ─────────────────────────────────────────────────────────

  const renderSummary = () => (
    <div className="space-y-3">
      {isEmpty ? (
        <p className="text-gray-500 text-sm py-4 text-center">No matchups yet.</p>
      ) : (
        localMatchups.map((matchup) => {
          const outs = matchup.entries
            .filter(isOutEntry)
            .sort((a, b) => a.card_name.localeCompare(b.card_name))
          const ins = matchup.entries
            .filter(isInEntry)
            .sort((a, b) => a.card_name.localeCompare(b.card_name))

          return (
            <div key={matchup.id} className="bg-gray-800 border border-gray-700 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                {renamingId === matchup.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSave(matchup.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSave(matchup.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    autoFocus
                    className="text-sm font-semibold bg-gray-700 border border-blue-500 rounded px-2 py-0.5 focus:outline-none"
                  />
                ) : (
                  <h3
                    className={`text-sm font-semibold text-gray-200 ${isEditable ? 'cursor-text' : ''}`}
                    onClick={() => {
                      if (isEditable) {
                        setRenamingId(matchup.id)
                        setRenameValue(matchup.name)
                      }
                    }}
                  >
                    vs {matchup.name}
                  </h3>
                )}
                {isEditable && (
                  <button
                    onClick={() => onRemoveMatchup(matchup.id)}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none ml-2"
                    aria-label={`Remove ${matchup.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
              {outs.length === 0 && ins.length === 0 ? (
                <p className="text-gray-600 text-xs">No changes planned.</p>
              ) : (
                <div className="space-y-1">
                  {outs.length > 0 && (
                    <p className="text-xs">
                      <span className="text-red-400 mr-1">↓</span>
                      {outs.map(formatEntryText).join(', ')}
                    </p>
                  )}
                  {ins.length > 0 && (
                    <p className="text-xs">
                      <span className="text-green-400 mr-1">↑</span>
                      {ins.map(formatEntryText).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
      {isEditable && (
        <div className="pt-1">
          {addingName !== null ? (
            <input
              ref={addInputRef}
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMatchup()
                if (e.key === 'Escape') setAddingName(null)
              }}
              onBlur={handleAddMatchup}
              placeholder="Matchup name (e.g. Burn)"
              className="px-3 py-1.5 bg-gray-700 border border-blue-500 rounded text-sm focus:outline-none w-56"
            />
          ) : (
            <button
              onClick={() => setAddingName('')}
              className="px-3 py-1.5 border border-dashed border-gray-600 rounded text-sm text-gray-400 hover:text-gray-300 hover:border-gray-500"
            >
              + Add Matchup
            </button>
          )}
        </div>
      )}
    </div>
  )

  // ── Grid view ────────────────────────────────────────────────────────────

  const LABEL_W = 'w-44 min-w-[11rem]'
  const COL_W = 'w-28 shrink-0'

  const renderGrid = () => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localMatchups.map((m) => m.id)} strategy={horizontalListSortingStrategy}>
        <div className="overflow-x-auto rounded border border-gray-700">
          {/* Header row */}
          <div className="flex bg-gray-800 border-b border-gray-700">
            <div className={`${LABEL_W} shrink-0 px-3 py-2 text-xs text-gray-500 uppercase font-semibold sticky left-0 bg-gray-800 z-10`}>
              Card
            </div>
            {localMatchups.map((matchup) => (
              <SortableMatchupHeader
                key={matchup.id}
                matchup={matchup}
                isEditing={isEditing}
                isRenaming={renamingId === matchup.id}
                renameValue={renameValue}
                onRenameStart={() => { setRenamingId(matchup.id); setRenameValue(matchup.name) }}
                onRenameChange={setRenameValue}
                onRenameSave={() => handleRenameSave(matchup.id)}
                onRenameCancel={() => setRenamingId(null)}
                onRemove={() => onRemoveMatchup(matchup.id)}
              />
            ))}
            {isEditing && (
              <div className={`${COL_W} border-l border-gray-700 px-2 py-2 flex items-center justify-center bg-gray-800`}>
                {addingName !== null ? (
                  <input
                    ref={addInputRef}
                    type="text"
                    value={addingName}
                    onChange={(e) => setAddingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddMatchup()
                      if (e.key === 'Escape') setAddingName(null)
                    }}
                    onBlur={handleAddMatchup}
                    placeholder="Name"
                    className="w-full text-xs bg-gray-700 border border-blue-500 rounded px-1.5 py-1 focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setAddingName('')}
                    className="text-gray-400 hover:text-gray-200 text-xs px-2 py-1 border border-dashed border-gray-600 rounded hover:border-gray-400"
                  >
                    + Add
                  </button>
                )}
              </div>
            )}
          </div>

          {/* OUT section */}
          {(outNames.length > 0 || isEditing) && (
            <>
              <div className="flex bg-gray-800/50 border-b border-gray-800">
                <div className={`${LABEL_W} shrink-0 px-3 py-1 text-xs text-red-400 font-semibold sticky left-0 bg-gray-850 z-10`}>
                  ↓ OUT (Mainboard)
                </div>
                {localMatchups.map((m) => (
                  <div key={m.id} className={`${COL_W} border-l border-gray-800`} />
                ))}
                {isEditing && <div className={`${COL_W} border-l border-gray-800`} />}
              </div>
              {outNames.length === 0 && isEditing && (
                <div className="flex border-b border-gray-800">
                  <div className={`${LABEL_W} shrink-0 px-3 py-2 text-xs text-gray-600 italic sticky left-0 bg-gray-900 z-10`}>
                    No mainboard cards
                  </div>
                  {localMatchups.map((m) => (
                    <div key={m.id} className={`${COL_W} border-l border-gray-800`} />
                  ))}
                </div>
              )}
              {outNames.map((cardName) => (
                <div key={cardName} className="flex border-b border-gray-800 hover:bg-gray-800/20">
                  <div className={`${LABEL_W} shrink-0 px-3 py-1.5 text-sm text-gray-300 truncate sticky left-0 bg-gray-900 z-10`} title={cardName}>
                    {cardName}
                  </div>
                  {localMatchups.map((matchup) => {
                    const entry = getEntry(matchup.id, cardName)
                    const isActive =
                      editingCell?.matchupId === matchup.id && editingCell?.cardName === cardName
                    return (
                      <GuideCell
                        key={matchup.id}
                        matchupId={matchup.id}
                        cardName={cardName}
                        isOut={true}
                        deltaPlay={entry?.delta_play ?? null}
                        deltaDraw={entry?.delta_draw ?? null}
                        isEditing={isEditing}
                        isActive={isActive}
                        activeMode={isActive ? activeCellMode : 'both'}
                        cellValuePlay={isActive ? cellValuePlay : ''}
                        cellValueDraw={isActive ? cellValueDraw : ''}
                        menuOpenFor={menuCell}
                        onActivate={() => activateCell(matchup.id, cardName, true, entry?.delta_play ?? null, entry?.delta_draw ?? null)}
                        onCellChangePlay={setCellValuePlay}
                        onCellChangeDraw={setCellValueDraw}
                        onCellSave={flushCell}
                        onCellCancel={() => setEditingCell(null)}
                        onMenuOpen={() => setMenuCell({ matchupId: matchup.id, cardName })}
                        onMenuClose={() => setMenuCell(null)}
                        onModeChange={(mode) => handleModeChange(matchup.id, cardName, true, mode, entry?.delta_play ?? null, entry?.delta_draw ?? null)}
                        onClear={() => { setMenuCell(null); void onSetEntry(matchup.id, cardName, null, null) }}
                      />
                    )
                  })}
                  {isEditing && <div className={`${COL_W} border-l border-gray-800`} />}
                </div>
              ))}
            </>
          )}

          {/* IN section */}
          {(inNames.length > 0 || isEditing) && (
            <>
              <div className="flex bg-gray-800/50 border-b border-gray-800">
                <div className={`${LABEL_W} shrink-0 px-3 py-1 text-xs text-green-400 font-semibold sticky left-0 bg-gray-850 z-10`}>
                  ↑ IN (Sideboard)
                </div>
                {localMatchups.map((m) => (
                  <div key={m.id} className={`${COL_W} border-l border-gray-800`} />
                ))}
                {isEditing && <div className={`${COL_W} border-l border-gray-800`} />}
              </div>
              {inNames.length === 0 && isEditing && (
                <div className="flex border-b border-gray-800">
                  <div className={`${LABEL_W} shrink-0 px-3 py-2 text-xs text-gray-600 italic sticky left-0 bg-gray-900 z-10`}>
                    No sideboard cards
                  </div>
                  {localMatchups.map((m) => (
                    <div key={m.id} className={`${COL_W} border-l border-gray-800`} />
                  ))}
                </div>
              )}
              {inNames.map((cardName) => (
                <div key={cardName} className="flex border-b border-gray-800 hover:bg-gray-800/20">
                  <div className={`${LABEL_W} shrink-0 px-3 py-1.5 text-sm text-gray-300 truncate sticky left-0 bg-gray-900 z-10`} title={cardName}>
                    {cardName}
                  </div>
                  {localMatchups.map((matchup) => {
                    const entry = getEntry(matchup.id, cardName)
                    const isActive =
                      editingCell?.matchupId === matchup.id && editingCell?.cardName === cardName
                    return (
                      <GuideCell
                        key={matchup.id}
                        matchupId={matchup.id}
                        cardName={cardName}
                        isOut={false}
                        deltaPlay={entry?.delta_play ?? null}
                        deltaDraw={entry?.delta_draw ?? null}
                        isEditing={isEditing}
                        isActive={isActive}
                        activeMode={isActive ? activeCellMode : 'both'}
                        cellValuePlay={isActive ? cellValuePlay : ''}
                        cellValueDraw={isActive ? cellValueDraw : ''}
                        menuOpenFor={menuCell}
                        onActivate={() => activateCell(matchup.id, cardName, false, entry?.delta_play ?? null, entry?.delta_draw ?? null)}
                        onCellChangePlay={setCellValuePlay}
                        onCellChangeDraw={setCellValueDraw}
                        onCellSave={flushCell}
                        onCellCancel={() => setEditingCell(null)}
                        onMenuOpen={() => setMenuCell({ matchupId: matchup.id, cardName })}
                        onMenuClose={() => setMenuCell(null)}
                        onModeChange={(mode) => handleModeChange(matchup.id, cardName, false, mode, entry?.delta_play ?? null, entry?.delta_draw ?? null)}
                        onClear={() => { setMenuCell(null); void onSetEntry(matchup.id, cardName, null, null) }}
                      />
                    )
                  })}
                  {isEditing && <div className={`${COL_W} border-l border-gray-800`} />}
                </div>
              ))}
            </>
          )}

          {isEmpty && (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              No matchups yet.{isEditable && ' Use + Add above to get started.'}
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  )

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-gray-500 text-sm py-4">Loading sideboard guide…</p>
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Summary / Grid toggle */}
        <div className="flex items-center bg-gray-800 border border-gray-700 rounded text-sm">
          <button
            onClick={() => { setView('summary'); setIsEditing(false) }}
            className={`px-3 py-1.5 rounded-l ${view === 'summary' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
          >
            Summary
          </button>
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-1.5 rounded-r ${view === 'grid' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}
          >
            Grid
          </button>
        </div>

        {/* Edit toggle (grid mode, editable only) */}
        {isEditable && view === 'grid' && (
          <button
            onClick={() => {
              void flushCell()
              setIsEditing((v) => !v)
            }}
            className={`px-3 py-1.5 rounded text-sm ${isEditing ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {/* Content */}
      {view === 'summary' ? renderSummary() : renderGrid()}
    </div>
  )
}
