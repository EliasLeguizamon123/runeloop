import { describe, expect, it } from 'vitest'
import { createEmptyGame, applyGameAction, claimPlayerToken, canMoveToken } from '@/lib/game/state'
import { parseGameState } from '@/lib/game/schema'
import { screenToWorld, worldToScreen } from '@/lib/board/coordinates'
import { rollDice } from '@/lib/dice/roll'
import { exportGame, importGame } from '@/lib/export/game'
import { chunkAsset, assembleAsset } from '@/lib/assets/chunking'
import { PNG_1X1 } from '../fixtures/image'

describe('game domain', () => {
  it('keeps player ownership separate from exported state', () => {
    const state = createEmptyGame()
    const joined = claimPlayerToken(state, 'Juan')
    expect(joined.token.name).toBe('Juan')
    expect(joined.token.x).toBe(160)
    expect(canMoveToken(joined.state, joined.token.id, 'p1', { [joined.token.id]: 'p1' })).toBe(true)
    expect(canMoveToken(joined.state, joined.token.id, 'p2', { [joined.token.id]: 'p1' })).toBe(false)
    expect(exportGame(joined.state)).not.toContain('ownerClientId')
  })

  it('reclaims imported player token by name without changing position', () => {
    const existing = { ...createEmptyGame(), players: [{ id: 'juan', name: 'Juan', x: 42, y: 23 }] }
    const joined = claimPlayerToken(existing, 'Juan')
    expect(joined.state.players).toHaveLength(1)
    expect(joined.token.x).toBe(42)
  })

  it('applies and validates world-coordinate movement', () => {
    const state = { ...createEmptyGame(), monsters: [{ id: 'goblin', name: 'Goblin', x: 0, y: 0 }] }
    expect(applyGameAction(state, { type: 'monster:moved', id: 'goblin', x: 20, y: 30 }).monsters[0]).toMatchObject({ x: 20, y: 30 })
    expect(() => applyGameAction(state, { type: 'monster:moved', id: 'goblin', x: Infinity, y: 0 })).toThrow()
  })

  it('removes a replaced map asset when no token references it', () => {
    const state = { ...createEmptyGame(), assets: [{ id: 'old', mimeType: 'image/png' as const, data: PNG_1X1 }] }
    expect(applyGameAction(state, { type: 'asset:deleted', id: 'old' }).assets).toEqual([])
  })

  it('keeps a shared image asset until its last BoardImage reference is removed', () => {
    const asset = { id: 'shared', mimeType: 'image/png' as const, data: PNG_1X1 }
    const image = { id: 'image-1', assetId: 'shared', x: 1, y: 2, width: 10, height: 10 }
    const state = { ...createEmptyGame(), assets: [asset], board: { ...createEmptyGame().board, images: [image, { ...image, id: 'image-2' }] } }
    const oneLeft = applyGameAction(state, { type: 'board-image:deleted', id: 'image-1' })
    expect(() => applyGameAction(oneLeft, { type: 'asset:deleted', id: 'shared' })).toThrow('Asset todavía en uso')
    const noneLeft = applyGameAction(oneLeft, { type: 'board-image:deleted', id: 'image-2' })
    expect(applyGameAction(noneLeft, { type: 'asset:deleted', id: 'shared' }).assets).toEqual([])
  })

  it('rejects invalid import without changing prior state', () => {
    const state = createEmptyGame()
    expect(() => importGame('{', state)).toThrow()
    expect(state.board.map).toBeNull()
    expect(() => parseGameState({ ...state, version: 3 })).toThrow('Versión')
    expect(parseGameState({ ...state, version: 1 })).toMatchObject({ version: 2, board: { images: [] } })
  })

  it('round trips screen and world coordinates with independent cameras', () => {
    const view = { zoom: 2, panX: 30, panY: -10 }
    expect(worldToScreen({ x: 10, y: 15 }, view)).toEqual({ x: 50, y: 20 })
    expect(screenToWorld({ x: 50, y: 20 }, view)).toEqual({ x: 10, y: 15 })
  })

  it('rolls requested dice using rejection-safe random bytes', () => {
    const values = rollDice(2, 6, bytes => bytes.fill(0))
    expect(values).toEqual([1, 1])
    expect(() => rollDice(21, 6)).toThrow()
  })

  it('assembles asset chunks even when delivered out of order', () => {
    const source = 'a'.repeat(150000)
    const chunks = chunkAsset('map', source, 65536)
    expect(assembleAsset(chunks.reverse(), source.length)).toBe(source)
    expect(() => assembleAsset(chunks.slice(1), source.length)).toThrow()
  })
})
