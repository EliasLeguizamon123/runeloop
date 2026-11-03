import type { GameState } from './types'

export type HistoryEntry = { before: GameState; after: GameState; label: string }
export type HistoryState = { undo: HistoryEntry[]; redo: HistoryEntry[] }

export function createHistory(): HistoryState { return { undo: [], redo: [] } }

export function recordGameChange(history: HistoryState, before: GameState, after: GameState, label: string): HistoryState {
  if (before === after) return history
  return { undo: [...history.undo, { before, after, label }].slice(-50), redo: [] }
}

export function undoGameChange(history: HistoryState): { history: HistoryState; state: GameState; label: string } | null {
  const entry = history.undo.at(-1)
  if (!entry) return null
  return { history: { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] }, state: entry.before, label: entry.label }
}

export function redoGameChange(history: HistoryState): { history: HistoryState; state: GameState; label: string } | null {
  const entry = history.redo.at(-1)
  if (!entry) return null
  return { history: { undo: [...history.undo, entry].slice(-50), redo: history.redo.slice(0, -1) }, state: entry.after, label: entry.label }
}
