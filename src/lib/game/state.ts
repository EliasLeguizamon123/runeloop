import type { GameAction, GameState, PlayerToken } from './types'
import { createId } from '@/lib/id'

export function createEmptyGame(): GameState {
  return { version: 2, metadata: {}, board: { map: null, drawings: [], images: [] }, players: [], monsters: [], assets: [] }
}

export function claimPlayerToken(state: GameState, name: string): { state: GameState; token: PlayerToken } {
  const existing = state.players.find(token => token.name === name)
  if (existing) return { state, token: existing }
  const token = { id: createId(), name, x: 160, y: 160 }
  return { state: { ...state, players: [...state.players, token] }, token }
}

export function canMoveToken(state: GameState, tokenId: string, clientId: string, owners: Record<string, string>, isDm = false): boolean {
  if (isDm) return state.players.some(t => t.id === tokenId) || state.monsters.some(t => t.id === tokenId)
  return state.players.some(t => t.id === tokenId) && owners[tokenId] === clientId
}

export function applyGameAction(state: GameState, action: GameAction): GameState {
  if ('x' in action && (!Number.isFinite(action.x) || !Number.isFinite(action.y))) throw new Error('Coordenadas inválidas')
  switch (action.type) {
    case 'player:created': return { ...state, players: [...state.players, action.token] }
    case 'player:moved': return { ...state, players: state.players.map(t => t.id === action.id ? { ...t, x: action.x, y: action.y } : t) }
    case 'player:image': return { ...state, players: state.players.map(t => t.id === action.id ? { ...t, assetId: action.assetId } : t) }
    case 'monster:created': return { ...state, monsters: [...state.monsters, action.token] }
    case 'monster:moved': return { ...state, monsters: state.monsters.map(t => t.id === action.id ? { ...t, x: action.x, y: action.y } : t) }
    case 'monster:deleted': return { ...state, monsters: state.monsters.filter(t => t.id !== action.id) }
    case 'monster:image': return { ...state, monsters: state.monsters.map(t => t.id === action.id ? { ...t, assetId: action.assetId } : t) }
    case 'map:updated': return { ...state, board: { ...state.board, map: action.map } }
    case 'drawing:added': return { ...state, board: { ...state.board, drawings: [...state.board.drawings, action.stroke] } }
    case 'drawing:removed': return { ...state, board: { ...state.board, drawings: state.board.drawings.filter(s => s.id !== action.id) } }
    case 'board-image:created': {
      if (![action.image.x, action.image.y, action.image.width, action.image.height].every(Number.isFinite) || action.image.width <= 0 || action.image.height <= 0) throw new Error('Imagen de tablero inválida')
      if (!state.assets.some(asset => asset.id === action.image.assetId)) throw new Error('Asset referenciado inexistente')
      if ([...state.players, ...state.monsters, ...state.board.drawings, ...state.board.images, ...state.assets].some(item => item.id === action.image.id)) throw new Error('ID duplicado')
      return { ...state, board: { ...state.board, images: [...state.board.images, action.image] } }
    }
    case 'board-image:moved': return { ...state, board: { ...state.board, images: state.board.images.map(image => image.id === action.id ? { ...image, x: action.x, y: action.y } : image) } }
    case 'board-image:deleted': return { ...state, board: { ...state.board, images: state.board.images.filter(image => image.id !== action.id) } }
    case 'asset:added': return { ...state, assets: [...state.assets.filter(a => a.id !== action.asset.id), action.asset] }
    case 'asset:deleted': {
      if (state.board.map?.assetId === action.id || state.board.images.some(image => image.assetId === action.id) || [...state.players, ...state.monsters].some(token => token.assetId === action.id)) throw new Error('Asset todavía en uso')
      return { ...state, assets: state.assets.filter(asset => asset.id !== action.id) }
    }
  }
}
