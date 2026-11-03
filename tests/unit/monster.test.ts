import { expect, it } from 'vitest'
import { createMonsterToken } from '@/lib/game/monster'

it('creates a named monster token with a usable fallback position', () => {
  const token = createMonsterToken('  Goblin  ')
  expect(token.name).toBe('Goblin')
  expect(token.x).toBeGreaterThan(0)
  expect(() => createMonsterToken('   ')).toThrow()
})
