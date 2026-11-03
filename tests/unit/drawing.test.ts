import { expect, it } from 'vitest'
import { strokeIntersectsPoint } from '@/lib/game/drawing'

it('erases a whole stroke when the eraser crosses a segment', () => {
  const stroke = { id: 'line', color: '#ffffff', width: 3, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
  expect(strokeIntersectsPoint(stroke, { x: 50, y: 2 }, 6)).toBe(true)
  expect(strokeIntersectsPoint(stroke, { x: 50, y: 20 }, 6)).toBe(false)
})
