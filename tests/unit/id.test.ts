import { expect, it, vi } from 'vitest'
import { createId } from '@/lib/id'

it('falls back to secure random bytes when randomUUID is unavailable', () => {
  vi.stubGlobal('crypto', { randomUUID: 'unavailable', getRandomValues: (bytes: Uint8Array) => bytes.fill(7) })
  try { expect(createId()).toBe('07070707-0707-4707-8707-070707070707') }
  finally { vi.unstubAllGlobals() }
})
