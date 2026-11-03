import { describe, expect, it } from 'vitest'
import { createEmptyGame } from '@/lib/game/state'
import { createHistory, recordGameChange, redoGameChange, undoGameChange } from '@/lib/game/history'

describe('shared game history', () => {
  it('does nothing for empty stacks and undoes/redoes a snapshot', () => {
    const before = createEmptyGame(), after = { ...before, monsters: [{ id: 'g', name: 'Goblin', x: 3, y: 4 }] }
    const history = recordGameChange(createHistory(), before, after, 'Crear monstruo')
    expect(undoGameChange(createHistory())).toBeNull()
    expect(undoGameChange(history)?.state).toBe(before)
    const undone = undoGameChange(history)!
    expect(redoGameChange(undone.history)?.state).toBe(after)
  })
  it('clears redo on new work and keeps at most fifty entries', () => {
    let history = createHistory(), state = createEmptyGame()
    for (let index = 0; index < 55; index++) {
      const next = { ...state, metadata: { name: String(index) } }
      history = recordGameChange(history, state, next, 'Cambio')
      state = next
    }
    expect(history.undo).toHaveLength(50)
    history = undoGameChange(history)!.history
    history = recordGameChange(history, state, { ...state, metadata: { name: 'new' } }, 'Nuevo cambio')
    expect(history.redo).toEqual([])
  })
  it('retains immutable before/after references for one atomic asset and image operation', () => {
    const before = createEmptyGame()
    const after = { ...before, board: { ...before.board, images: [{ id: 'i', assetId: 'a', x: 0, y: 0, width: 4, height: 5 }] }, assets: [{ id: 'a', mimeType: 'image/png' as const, data: 'AA==' }] }
    const history = recordGameChange(createHistory(), before, after, 'Agregar imagen')
    expect(undoGameChange(history)?.state).toBe(before)
  })
})
