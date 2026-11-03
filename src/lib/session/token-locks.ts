export type TokenLock = { tokenId: string; lockId: string; clientId: string; name: string; expiresAt: number }
export type TokenLockRequest = Omit<TokenLock, 'expiresAt'>

export function validTokenLock(value: unknown): value is TokenLock {
  if (!value || typeof value !== 'object') return false
  const lock = value as Partial<TokenLock>
  return typeof lock.tokenId === 'string' && typeof lock.lockId === 'string' && typeof lock.clientId === 'string' && typeof lock.name === 'string' && Number.isFinite(lock.expiresAt)
}

export function grantTokenLock(locks: TokenLock[], request: TokenLockRequest, now: number) {
  const current = locks.filter(lock => lock.expiresAt > now)
  const held = current.find(lock => lock.tokenId === request.tokenId)
  if (held) return { locks: current, result: 'rejected' as const, holderName: held.name }
  return { locks: [...current, { ...request, expiresAt: now + 8000 }], result: 'granted' as const }
}

export function renewTokenLock(locks: TokenLock[], request: Pick<TokenLock, 'tokenId' | 'lockId' | 'clientId'>, now: number): TokenLock[] {
  return locks.map(lock => lock.tokenId === request.tokenId && lock.lockId === request.lockId && lock.clientId === request.clientId && lock.expiresAt > now
    ? { ...lock, expiresAt: now + 8000 }
    : lock)
}

export function releaseTokenLock(locks: TokenLock[], tokenId: string, lockId: string): TokenLock[] {
  return locks.filter(lock => lock.tokenId !== tokenId || lock.lockId !== lockId)
}

export function expireTokenLocks(locks: TokenLock[], now: number): TokenLock[] {
  return locks.filter(lock => lock.expiresAt > now)
}
