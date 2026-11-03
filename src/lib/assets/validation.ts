import type { Asset, GameState } from '@/lib/game/types'

export function assetBytes(data: string): number {
  if (!data || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('Imagen inválida')
  return data.length * 3 / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)
}

export function validateAsset(value: { id: string; mimeType: string; data: string }, kind: 'map' | 'token'): asserts value is Asset {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType)) throw new Error('Formato de imagen inválido. Usá JPG, PNG o WebP.')
  if (assetBytes(value.data) > (kind === 'map' ? 4 * 1024 * 1024 : 512 * 1024)) throw new Error('La imagen procesada supera el límite.')
  const bytes = atob(value.data.slice(0, 32))
  const png = bytes.startsWith('\x89PNG\r\n\x1a\n')
  const jpeg = bytes.startsWith('\xff\xd8\xff')
  const webp = bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
  if (!(value.mimeType === 'image/png' && png || value.mimeType === 'image/jpeg' && jpeg || value.mimeType === 'image/webp' && webp)) throw new Error('Imagen inválida')
}

export async function addDeduplicatedAsset(state: GameState, value: { id: string; mimeType: string; data: string }, kind: 'map' | 'token'): Promise<{ state: GameState; id: string; added: boolean }> {
  validateAsset(value, kind)
  const existing = state.assets.find(item => item.mimeType === value.mimeType && item.data === value.data)
  if (existing) return { state, id: existing.id, added: false }
  if (state.assets.length >= 20) throw new Error('La partida llegó al máximo de 20 imágenes.')
  const total = state.assets.reduce((sum, item) => sum + assetBytes(item.data), 0) + assetBytes(value.data)
  if (total > 10 * 1024 * 1024) throw new Error('La partida supera 10 MB de imágenes.')
  return { state: { ...state, assets: [...state.assets, value] }, id: value.id, added: true }
}
