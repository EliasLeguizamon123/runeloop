import { expect, it } from 'vitest'
import { createEmptyGame } from '@/lib/game/state'
import { makeSyncManifest, restoreSyncState, chunkText, assembleText } from '@/lib/realtime/sync'
import { PNG_1X1 } from '../fixtures/image'

it('sends a structural snapshot without Base64 and restores it after assets arrive', () => {
  const game = { ...createEmptyGame(), assets: [{ id: 'image', mimeType: 'image/png' as const, data: PNG_1X1 }] }
  const manifest = makeSyncManifest(game)
  expect(JSON.stringify(manifest)).not.toContain(PNG_1X1)
  expect(restoreSyncState(manifest, { image: PNG_1X1 })).toEqual(game)
  const changed = PNG_1X1.slice(0, -5) + 'B' + PNG_1X1.slice(-4)
  expect(changed).toHaveLength(PNG_1X1.length)
  expect(() => restoreSyncState(manifest, { image: changed })).toThrow('Asset')
})

it('fragments a large snapshot and checks completeness', () => {
  const source = 'a'.repeat(180000)
  const chunks = chunkText(source)
  expect(chunks.length).toBeGreaterThan(1)
  expect(assembleText(chunks.reverse(), source.length)).toBe(source)
  expect(() => assembleText(chunks.slice(1), source.length)).toThrow()
})
