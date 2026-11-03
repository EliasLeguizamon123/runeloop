import { describe, expect, it } from 'vitest'
import { admitPlayer, releasePlayer } from '@/lib/realtime/admission'
import { parseRealtimeEvent, unwrapRealtimeMessage, fitsBroadcastBudget } from '@/lib/realtime/events'

describe('realtime boundaries', () => {
  it('serializes admission and rejects a seventh player', () => {
    let active: Record<string, string> = {}
    for (let i = 0; i < 6; i++) active = admitPlayer(active, `id${i}`, `Player ${i}`).active
    expect(admitPlayer(active, 'id7', 'Player 7').reason).toBe('La partida está completa.')
    expect(admitPlayer(active, 'id7', 'Player 0').reason).toBe('Ese nombre ya está en uso.')
    expect(admitPlayer(releasePlayer(active, 'id0'), 'id7', 'Player 7').reason).toBeUndefined()
  })

  it('trims names and rejects invalid lengths or an exact duplicate', () => {
    expect(admitPlayer({}, 'p1', '  Juan  ').active.p1).toBe('Juan')
    expect(admitPlayer({}, 'p1', ' ').reason).toContain('2 a 24')
    expect(admitPlayer({}, 'p1', 'a'.repeat(25)).reason).toContain('2 a 24')
    expect(admitPlayer({ p1: 'Juan' }, 'p2', 'Juan').reason).toContain('en uso')
  })

  it('rejects malformed messages before app state sees them', () => {
    expect(() => parseRealtimeEvent({ type: 'game:action', senderId: 'dm', revision: 1, action: { type: 'monster:moved', id: 'm', x: 'oops', y: 1 } })).toThrow()
    expect(parseRealtimeEvent({ type: 'ping:created', senderId: 'p1', id: 'ping', x: 12, y: 8 }).type).toBe('ping:created')
  })

  it('ignores events for a different room or protocol version', () => {
    const message = { roomId: 'room-a', protocolVersion: 1, message: { type: 'ping:created', senderId: 'p1', id: 'ping', x: 1, y: 2 } }
    expect(unwrapRealtimeMessage(message, 'room-a')?.type).toBe('ping:created')
    expect(unwrapRealtimeMessage(message, 'room-b')).toBeNull()
    expect(unwrapRealtimeMessage({ ...message, protocolVersion: 2 }, 'room-a')).toBeNull()
  })

  it('measures the full envelope before sending a chunk', () => {
    expect(fitsBroadcastBudget({ roomId: 'room-a', protocolVersion: 1, message: { data: 'a'.repeat(65536) } })).toBe(true)
    expect(fitsBroadcastBudget({ roomId: 'room-a', protocolVersion: 1, message: { data: 'a'.repeat(200000) } })).toBe(false)
  })
})
