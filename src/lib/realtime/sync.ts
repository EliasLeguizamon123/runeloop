import type { Asset, GameState } from '@/lib/game/types'
import { parseGameState } from '@/lib/game/schema'

export type SyncManifest = Omit<GameState, 'assets'> & { assets: (Omit<Asset, 'data'> & { length: number; fingerprint: string })[] }
export type TextChunk = { index: number; total: number; data: string }

export function makeSyncManifest(game: GameState): SyncManifest {
  return { ...game, assets: game.assets.map(({ id, mimeType, data }) => ({ id, mimeType, length: data.length, fingerprint: fingerprint(data) })) }
}

export function restoreSyncState(manifest: SyncManifest, data: Record<string, string>): GameState {
  for (const item of manifest.assets) if (data[item.id]?.length !== item.length || fingerprint(data[item.id]) !== item.fingerprint) throw new Error('Asset incorrecto')
  return parseGameState({ ...manifest, assets: manifest.assets.map(item => ({ id: item.id, mimeType: item.mimeType, data: data[item.id] })) })
}

export function fingerprint(data: string): string {
  let hash = 2166136261
  for (let index = 0; index < data.length; index++) hash = Math.imul(hash ^ data.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function chunkText(value: string, maxChars = 65536): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error('Chunk inválido')
  const total = Math.max(1, Math.ceil(value.length / maxChars))
  return Array.from({ length: total }, (_, index) => ({ index, total, data: value.slice(index * maxChars, (index + 1) * maxChars) }))
}

export function assembleText(chunks: TextChunk[], expectedLength: number): string {
  if (!chunks.length || chunks.length !== chunks[0].total || new Set(chunks.map(c => c.index)).size !== chunks[0].total || chunks.some(c => c.index < 0 || c.index >= c.total || c.total !== chunks[0].total)) throw new Error('Transferencia incompleta')
  const value = [...chunks].sort((a, b) => a.index - b.index).map(c => c.data).join('')
  if (value.length !== expectedLength) throw new Error('Transferencia incompleta')
  return value
}
