import type { GameState } from '@/lib/game/types'
import { parseGameState } from '@/lib/game/schema'

export function exportGame(state: GameState): string {
  const json = JSON.stringify(parseGameState(state))
  if (new TextEncoder().encode(json).length > 15 * 1024 * 1024) throw new Error('El JSON supera 15 MB')
  return json
}

export function importGame(json: string, _current?: GameState): GameState {
  void _current
  if (new TextEncoder().encode(json).length > 15 * 1024 * 1024) throw new Error('El JSON supera 15 MB')
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('JSON inválido') }
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && parsed.version !== 1 && parsed.version !== 2) throw new Error('Versión de export no soportada')
  return parseGameState(parsed)
}
