import type { MonsterToken } from './types'
import { createId } from '@/lib/id'

export function createMonsterToken(rawName: string): MonsterToken {
  const name = rawName.trim()
  if (!name || name.length > 64) throw new Error('Ingresá un nombre de hasta 64 caracteres.')
  return { id: createId(), name, x: 80, y: 80 }
}
