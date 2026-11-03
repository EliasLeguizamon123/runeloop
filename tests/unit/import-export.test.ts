import { expect, it } from 'vitest'
import { createEmptyGame } from '@/lib/game/state'
import { exportGame, importGame } from '@/lib/export/game'
import { PNG_1X1 } from '../fixtures/image'
import { applyGameAction } from '@/lib/game/state'

it('round trips a map, drawings, tokens and shared asset without session fields', () => {
  const state = {
    ...createEmptyGame(),
    board: { map: { assetId: 'image', x: 20, y: 30, width: 100, height: 100 }, drawings: [{ id: 'line', points: [{ x: 1, y: 2 }], color: '#ffffff', width: 2 }], images: [] },
    players: [{ id: 'p1', name: 'Juan', x: 40, y: 50, assetId: 'image' }, { id: 'p2', name: 'Lucía', x: 60, y: 70, assetId: 'image' }],
    monsters: [{ id: 'm1', name: 'Goblin', x: 80, y: 90 }],
    assets: [{ id: 'image', mimeType: 'image/png' as const, data: PNG_1X1 }],
  }
  const json = exportGame(state)
  expect(json.match(/iVBORw0KGgo/g)).toHaveLength(1)
  expect(json).not.toContain('ownerClientId')
  expect(json).not.toContain('roomId')
  expect(importGame(json)).toEqual(state)
  expect(JSON.parse(json).version).toBe(2)
})

it('migrates v1 imports and validates BoardImage references and geometry', () => {
  const v1 = { ...createEmptyGame(), version: 1 as const }
  const migrated = importGame(JSON.stringify(v1))
  expect(migrated).toMatchObject({ version: 2, board: { images: [] } })
  const state = { ...createEmptyGame(), assets: [{ id: 'asset', mimeType: 'image/png' as const, data: PNG_1X1 }] }
  const image = { id: 'image', assetId: 'asset', x: 1, y: 2, width: 30, height: 20 }
  expect(applyGameAction(state, { type: 'board-image:created', image }).board.images).toEqual([image])
  expect(() => applyGameAction(state, { type: 'board-image:created', image: { ...image, width: 0 } })).toThrow()
  expect(() => importGame(JSON.stringify({ ...state, version: 2, board: { ...state.board, images: [{ ...image, assetId: 'missing' }] } }))).toThrow('Asset')
  expect(() => importGame(JSON.stringify({ ...state, version: 3 }))).toThrow('Versión')
})

it('round trips BoardImage dimensions, world position and a deduplicated asset', () => {
  const state = { ...createEmptyGame(), board: { ...createEmptyGame().board, images: [{ id: 'marker', assetId: 'shared', x: 22, y: 31, width: 70, height: 40 }] }, assets: [{ id: 'shared', mimeType: 'image/png' as const, data: PNG_1X1 }] }
  const exported = exportGame(state)
  expect(importGame(exported)).toEqual(state)
  expect(exported.match(/iVBORw0KGgo/g)).toHaveLength(1)
})

it('rejects future export versions and JSON larger than the configured limit', () => {
  expect(() => importGame(JSON.stringify({ ...createEmptyGame(), version: 3 }))).toThrow('Versión')
  expect(() => exportGame({ ...createEmptyGame(), metadata: { name: 'x'.repeat(15 * 1024 * 1024) } })).toThrow('15 MB')
})
