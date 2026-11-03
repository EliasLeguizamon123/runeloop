import { expect, it } from 'vitest'
import { validateAsset, addDeduplicatedAsset } from '@/lib/assets/validation'
import { createEmptyGame } from '@/lib/game/state'
import { PNG_1X1 } from '../fixtures/image'
import { processImage } from '@/lib/assets/processing'

it('rejects SVG and oversized processed images before state mutation', async () => {
  const svg = { id: 'a', mimeType: 'image/svg+xml', data: 'AAAA' }
  expect(() => validateAsset(svg, 'map')).toThrow()
  expect(() => validateAsset({ id: 'a', mimeType: 'image/png', data: 'A'.repeat(6 * 1024 * 1024) }, 'map')).toThrow()
})

it('stores the same asset bytes once', async () => {
  const game = createEmptyGame()
  const first = await addDeduplicatedAsset(game, { id: 'a', mimeType: 'image/png', data: PNG_1X1 }, 'token')
  const second = await addDeduplicatedAsset(first.state, { id: 'b', mimeType: 'image/png', data: PNG_1X1 }, 'token')
  expect(second.state.assets).toHaveLength(1)
  expect(second.id).toBe(first.id)
})

it('rejects Base64 that is not an image of its declared type', () => {
  expect(() => validateAsset({ id: 'fake', mimeType: 'image/png', data: 'AAAA' }, 'token')).toThrow('Imagen inválida')
})

it('rejects an oversized source file before decoding it', async () => {
  const huge = { type: 'image/png', size: 21 * 1024 * 1024 } as File
  await expect(processImage(huge, 'map')).rejects.toThrow('Archivo original')
})
