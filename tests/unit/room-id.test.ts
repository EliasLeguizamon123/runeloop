import { describe, expect, it } from 'vitest'
import { createRoomId } from '@/lib/room/id'

describe('createRoomId', () => {
  it('produces unique 12-character URL-safe room IDs', () => {
    const ids = Array.from({ length: 1000 }, createRoomId)
    expect(new Set(ids).size).toBe(1000)
    expect(ids.every(id => /^[A-Za-z0-9_-]{12}$/.test(id))).toBe(true)
  })
})
