import { z } from 'zod'
import type { GameState } from './types'
import { validateAsset } from '@/lib/assets/validation'

const point = z.object({ x: z.number().finite(), y: z.number().finite() })
const token = point.extend({ id: z.string().min(1), name: z.string().min(1).max(64), assetId: z.string().optional() })
const asset = z.object({ id: z.string().min(1), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) })
const stroke = z.object({ id: z.string().min(1), points: z.array(point).min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().positive().max(100) })
export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('player:created'), token }),
  z.object({ type: z.literal('player:moved'), id: z.string(), x: z.number().finite(), y: z.number().finite() }),
  z.object({ type: z.literal('player:image'), id: z.string(), assetId: z.string().optional() }),
  z.object({ type: z.literal('monster:created'), token }),
  z.object({ type: z.literal('monster:moved'), id: z.string(), x: z.number().finite(), y: z.number().finite() }),
  z.object({ type: z.literal('monster:deleted'), id: z.string() }),
  z.object({ type: z.literal('monster:image'), id: z.string(), assetId: z.string().optional() }),
  z.object({ type: z.literal('map:updated'), map: point.extend({ assetId: z.string(), width: z.number().positive(), height: z.number().positive() }).nullable() }),
  z.object({ type: z.literal('drawing:added'), stroke }),
  z.object({ type: z.literal('drawing:removed'), id: z.string() }),
  z.object({ type: z.literal('board-image:created'), image: point.extend({ id: z.string().min(1), assetId: z.string().min(1), width: z.number().positive().finite(), height: z.number().positive().finite() }) }),
  z.object({ type: z.literal('board-image:moved'), id: z.string(), x: z.number().finite(), y: z.number().finite() }),
  z.object({ type: z.literal('board-image:deleted'), id: z.string() }),
  z.object({ type: z.literal('asset:added'), asset }),
  z.object({ type: z.literal('asset:deleted'), id: z.string() }),
])
const schema = z.object({
  version: z.literal(2),
  metadata: z.object({ name: z.string().optional() }),
  board: z.object({
    map: point.extend({ assetId: z.string(), width: z.number().positive().finite(), height: z.number().positive().finite() }).nullable(),
    drawings: z.array(stroke), images: z.array(point.extend({ id: z.string().min(1), assetId: z.string().min(1), width: z.number().positive().finite(), height: z.number().positive().finite() })),
  }),
  players: z.array(token), monsters: z.array(token), assets: z.array(asset).max(20),
})

export function parseGameState(input: unknown): GameState {
  if (typeof input !== 'object' || input === null || !('version' in input)) throw new Error('Estado de partida inválido')
  const version = (input as { version?: unknown }).version
  if (version !== 1 && version !== 2) throw new Error('Versión de export no soportada')
  const migrated = version === 1 ? { ...input, version: 2, board: { ...(input as { board?: object }).board, images: [] } } : input
  const value = schema.parse(migrated) as GameState
  const ids = [...value.players, ...value.monsters, ...value.board.drawings, ...value.board.images, ...value.assets].map(item => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('IDs duplicados')
  const available = new Set(value.assets.map(item => item.id))
  const refs = [value.board.map?.assetId, ...value.board.images.map(item => item.assetId), ...value.players.map(item => item.assetId), ...value.monsters.map(item => item.assetId)].filter(Boolean)
  if (refs.some(id => !available.has(id!))) throw new Error('Asset referenciado inexistente')
  let total = 0
  for (const item of value.assets) {
    const usedByToken = [...value.players, ...value.monsters].some(token => token.assetId === item.id)
    validateAsset(item, !usedByToken && value.board.map?.assetId === item.id ? 'map' : 'token')
    const size = item.data.length * 3 / 4 - (item.data.endsWith('==') ? 2 : item.data.endsWith('=') ? 1 : 0)
    if (size > (value.board.map?.assetId === item.id ? 4 : .5) * 1024 * 1024) throw new Error('Asset demasiado grande')
    total += size
  }
  if (total > 10 * 1024 * 1024) throw new Error('Assets demasiado grandes')
  return value
}
