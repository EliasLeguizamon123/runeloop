import { describe, expect, it } from 'vitest'
import { grantTokenLock, releaseTokenLock, renewTokenLock, validTokenLock } from '@/lib/session/token-locks'

const first = { tokenId: 'token', lockId: 'lock-1', clientId: 'p1', name: 'Juan' }
describe('token lock arbitration', () => {
  it('grants one holder and rejects another until release or expiry', () => {
    const granted = grantTokenLock([], first, 100)
    expect(granted.result).toBe('granted')
    expect(grantTokenLock(granted.locks, { ...first, lockId: 'lock-2', clientId: 'p2', name: 'Lucía' }, 101)).toMatchObject({ result: 'rejected', holderName: 'Juan' })
    expect(grantTokenLock(granted.locks, { ...first, lockId: 'lock-2', clientId: 'p2' }, 8100).result).toBe('granted')
  })
  it('renews only the current lock and releases by lock id', () => {
    const granted = grantTokenLock([], first, 100)
    expect(renewTokenLock(granted.locks, { tokenId: 'token', lockId: 'lock-1', clientId: 'p1' }, 3000)[0].expiresAt).toBe(11000)
    expect(renewTokenLock(granted.locks, { tokenId: 'token', lockId: 'stale', clientId: 'p1' }, 4000)).toEqual(granted.locks)
    expect(releaseTokenLock(granted.locks, 'token', 'wrong')).toEqual(granted.locks)
    expect(releaseTokenLock(granted.locks, 'token', 'lock-1')).toEqual([])
  })
  it('rejects stale and malformed locks', () => {
    expect(validTokenLock({ ...first, expiresAt: Infinity })).toBe(false)
  })
})
