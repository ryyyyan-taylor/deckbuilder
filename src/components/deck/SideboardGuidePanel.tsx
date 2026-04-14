import { useState, useEffect, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DeckCard } from '../../hooks/useDeck'
import type { SideboardGuideMatchup } from '../../hooks/useSideboardGuide'

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
  onSetEntry: (matchupId: string, cardName: string, delta: number) => Promise<boolean>
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
  delta: number | undefined
  isEditing: boolean
  isActive: boolean
  cellValue: string
  onActivate: () => void
  onCellChange: (v: string) => void
  onCellSave: () => void
  onCellCancel: () => void
}

function GuideCell({
  isOut, delta, isEditing, isActive,
  cellValue, onActivate, onCellChange, onCellSave, onCellCancel,
}: CellProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isActive])

  const absValue = delta !== undefined ? Math.abs(delta) : 0
  const colorClass = isOut ? 'text-red-400 font-medium' : 'text-green-400 font-medium'

  return (
    <div
      className={`w-28 shrink-0 border-l border-gray-800 px-2 py-1.5 text-center text-sm
        ${isEditing && !isActive ? 'cursor-pointer hover:bg-gray-700/40' : ''}
      `}
      onClick={() => {
        if (isEditing && !isActive) onActivate()
      }}
    >
      {isActive ? (
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={9}
          value={cellValue}
          onChange={(e) => onCellChange(e.target.value)}
          onBlur={onCellSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCellSave()
            if (e.key === 'Escape') onCellCancel()
          }}
          className="w-full text-center bg-gray-700 border border-blue-500 rounded text-sm focus:outline-none px-1 py-0"
        />
      ) : absValue > 0 ? (
        <span className={colorClass}>{absValue}</span>
      ) : isEditing ? (
        <span className="text-gray-700 select-none">–</span>
      ) : null}
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
  const [cellValue, setCellValue] = useState('')
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

  // Save currently editing cell
  const flushCell = async () => {
    if (!editingCell) return
    const { matchupId, cardName, isOut } = editingCell
    const num = parseInt(cellValue, 10)
    const delta = isNaN(num) || num <= 0 ? 0 : isOut ? -num : num
    setEditingCell(null)
    await onSetEntry(matchupId, cardName, delta)
  }

  const activateCell = (matchupId: string, cardName: string, isOut: boolean, currentAbs: number) => {
    // Flush any open cell first
    if (editingCell) {
      void flushCell()
    }
    setEditingCell({ matchupId, cardName, isOut })
    setCellValue(currentAbs > 0 ? String(currentAbs) : '')
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
  const outNames = isEditing
    ? mainNames
    : [...new Set(
        localMatchups.flatMap((m) => m.entries.filter((e) => e.delta < 0).map((e) => e.card_name))
      )].sort()

  const inNames = isEditing
    ? sideNames
    : [...new Set(
        localMatchups.flatMap((m) => m.entries.filter((e) => e.delta > 0).map((e) => e.card_name))
      )].sort()

  // Helper: get delta for a card in a matchup
  const getDelta = (matchupId: string, cardName: string): number | undefined => {
    const entry = localMatchups
      .find((m) => m.id === matchupId)
      ?.entries.find((e) => e.card_name.toLowerCase() === cardName.toLowerCase())
    return entry?.delta
  }

  const isEmpty = localMatchups.length === 0

  // ── Summary view ─────────────────────────────────────────────────────────

  const renderSummary = () => (
    <div className="space-y-3">
      {isEmpty ? (
        <p className="text-gray-500 text-sm py-4 text-center">No matchups yet.</p>
      ) : (
        localMatchups.map((matchup) => {
          const outs = matchup.entries
            .filter((e) => e.delta < 0)
            .sort((a, b) => a.card_name.localeCompare(b.card_name))
          const ins = matchup.entries
            .filter((e) => e.delta > 0)
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
                      {outs.map((e) => `−${Math.abs(e.delta)} ${e.card_name}`).join(', ')}
                    </p>
                  )}
                  {ins.length > 0 && (
                    <p className="text-xs">
                      <span className="text-green-400 mr-1">↑</span>
                      {ins.map((e) => `+${e.delta} ${e.card_name}`).join(', ')}
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
                    const delta = getDelta(matchup.id, cardName)
                    const absVal = delta !== undefined ? Math.abs(delta) : 0
                    const isActive =
                      editingCell?.matchupId === matchup.id && editingCell?.cardName === cardName
                    return (
                      <GuideCell
                        key={matchup.id}
                        matchupId={matchup.id}
                        cardName={cardName}
                        isOut={true}
                        delta={delta}
                        isEditing={isEditing}
                        isActive={isActive}
                        cellValue={isActive ? cellValue : ''}
                        onActivate={() => activateCell(matchup.id, cardName, true, absVal)}
                        onCellChange={setCellValue}
                        onCellSave={flushCell}
                        onCellCancel={() => setEditingCell(null)}
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
                    const delta = getDelta(matchup.id, cardName)
                    const absVal = delta !== undefined ? Math.abs(delta) : 0
                    const isActive =
                      editingCell?.matchupId === matchup.id && editingCell?.cardName === cardName
                    return (
                      <GuideCell
                        key={matchup.id}
                        matchupId={matchup.id}
                        cardName={cardName}
                        isOut={false}
                        delta={delta}
                        isEditing={isEditing}
                        isActive={isActive}
                        cellValue={isActive ? cellValue : ''}
                        onActivate={() => activateCell(matchup.id, cardName, false, absVal)}
                        onCellChange={setCellValue}
                        onCellSave={flushCell}
                        onCellCancel={() => setEditingCell(null)}
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
