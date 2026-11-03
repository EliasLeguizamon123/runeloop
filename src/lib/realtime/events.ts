import { z } from 'zod'
import { gameActionSchema } from '@/lib/game/schema'
import type { GameAction, DiceRoll } from '@/lib/game/types'
import { validTokenLock, type TokenLock } from '@/lib/session/token-locks'

const base = { senderId: z.string().min(1) }
const eventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('player:join-request'), name: z.string(), requestId: z.string() }),
  z.object({ ...base, type: z.literal('player:join-accepted'), targetId: z.string(), name: z.string(), tokenId: z.string() }),
  z.object({ ...base, type: z.literal('player:join-rejected'), targetId: z.string(), reason: z.string() }),
  z.object({ ...base, type: z.literal('game:request-sync'), targetId: z.string().optional() }),
  z.object({ ...base, type: z.literal('game:sync'), targetId: z.string().optional(), transferId: z.string(), revision: z.number().int().nonnegative(), length: z.number().int().nonnegative(), total: z.number().int().positive() }),
  z.object({ ...base, type: z.literal('game:sync-chunk'), targetId: z.string().optional(), transferId: z.string(), index: z.number().int().nonnegative(), total: z.number().int().positive(), data: z.string().max(65536) }),
  z.object({ ...base, type: z.literal('game:action-request'), requestId: z.string(), sequence: z.number().int().positive(), action: gameActionSchema }),
  z.object({ ...base, type: z.literal('game:action'), requestId: z.string(), revision: z.number().int().nonnegative(), action: gameActionSchema }),
  z.object({ ...base, type: z.literal('token:lock-request'), requestId: z.string(), tokenId: z.string(), lockId: z.string(), name: z.string() }),
  z.object({ ...base, type: z.literal('token:lock-granted'), requestId: z.string(), lock: z.custom<TokenLock>(validTokenLock) }),
  z.object({ ...base, type: z.literal('token:lock-rejected'), requestId: z.string(), targetId: z.string(), tokenId: z.string(), holderName: z.string() }),
  z.object({ ...base, type: z.literal('token:lock-heartbeat'), tokenId: z.string(), lockId: z.string() }),
  z.object({ ...base, type: z.literal('token:lock-release'), tokenId: z.string(), lockId: z.string() }),
  z.object({ ...base, type: z.literal('token:locks-sync'), targetId: z.string(), locks: z.array(z.custom<TokenLock>(validTokenLock)) }),
  z.object({ ...base, type: z.literal('token:move-commit'), requestId: z.string(), sequence: z.number().int().positive(), tokenId: z.string(), lockId: z.string(), x: z.number().finite(), y: z.number().finite() }),
  z.object({ ...base, type: z.literal('dice:roll-request'), requestId: z.string(), count: z.number().int(), die: z.number().int() }),
  z.object({ ...base, type: z.literal('dice:rolled'), roll: z.object({ id: z.string(), name: z.string(), die: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12), z.literal(20), z.literal(100)]), values: z.array(z.number().int().positive()) }) }),
  z.object({ ...base, type: z.literal('ping:created'), id: z.string(), x: z.number().finite(), y: z.number().finite(), name: z.string().optional() }),
  z.object({ ...base, type: z.literal('pointer:moved'), x: z.number().finite(), y: z.number().finite(), clientId: z.string().optional(), name: z.string().optional() }),
  z.object({ ...base, type: z.literal('asset:request'), assetId: z.string(), targetId: z.string() }),
  z.object({ ...base, type: z.literal('asset:chunk'), targetId: z.string(), assetId: z.string(), index: z.number().int().nonnegative(), total: z.number().int().positive(), length: z.number().int().nonnegative(), data: z.string().max(65536) }),
  z.object({ ...base, type: z.literal('game:ended') }),
])

export type RealtimeEvent =
  | { type: 'player:join-request'; senderId: string; name: string; requestId: string }
  | { type: 'player:join-accepted'; senderId: string; targetId: string; name: string; tokenId: string }
  | { type: 'player:join-rejected'; senderId: string; targetId: string; reason: string }
  | { type: 'game:request-sync'; senderId: string; targetId?: string }
  | { type: 'game:sync'; senderId: string; targetId?: string; transferId: string; revision: number; length: number; total: number }
  | { type: 'game:sync-chunk'; senderId: string; targetId?: string; transferId: string; index: number; total: number; data: string }
  | { type: 'game:action-request'; senderId: string; requestId: string; sequence: number; action: GameAction }
  | { type: 'game:action'; senderId: string; requestId: string; revision: number; action: GameAction }
  | { type: 'token:lock-request'; senderId: string; requestId: string; tokenId: string; lockId: string; name: string }
  | { type: 'token:lock-granted'; senderId: string; requestId: string; lock: TokenLock }
  | { type: 'token:lock-rejected'; senderId: string; targetId: string; requestId: string; tokenId: string; holderName: string }
  | { type: 'token:lock-heartbeat'; senderId: string; tokenId: string; lockId: string }
  | { type: 'token:lock-release'; senderId: string; tokenId: string; lockId: string }
  | { type: 'token:locks-sync'; senderId: string; targetId: string; locks: TokenLock[] }
  | { type: 'token:move-commit'; senderId: string; requestId: string; sequence: number; tokenId: string; lockId: string; x: number; y: number }
  | { type: 'dice:roll-request'; senderId: string; requestId: string; count: number; die: number }
  | { type: 'dice:rolled'; senderId: string; roll: DiceRoll }
  | { type: 'ping:created'; senderId: string; id: string; x: number; y: number; name?: string }
  | { type: 'pointer:moved'; senderId: string; x: number; y: number; clientId?: string; name?: string }
  | { type: 'asset:request'; senderId: string; targetId: string; assetId: string }
  | { type: 'asset:chunk'; senderId: string; targetId: string; assetId: string; index: number; total: number; length: number; data: string }
  | { type: 'game:ended'; senderId: string }

export function parseRealtimeEvent(input: unknown): RealtimeEvent {
  return eventSchema.parse(input) as RealtimeEvent
}

export function unwrapRealtimeMessage(input: unknown, roomId: string): RealtimeEvent | null {
  if (!input || typeof input !== 'object') return null
  const envelope = input as Record<string, unknown>
  if (envelope.roomId !== roomId || envelope.protocolVersion !== 1) return null
  try { return parseRealtimeEvent(envelope.message) } catch { return null }
}

export function fitsBroadcastBudget(payload: unknown, maxBytes = 192 * 1024): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= maxBytes
}
