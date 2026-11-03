import type { DrawingStroke, Point } from './types'

export function strokeIntersectsPoint(stroke: DrawingStroke, point: Point, radius: number): boolean {
  const limit = radius + stroke.width / 2
  for (let index = 0; index < stroke.points.length; index++) {
    const a = stroke.points[index]
    const b = stroke.points[index + 1] ?? a
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    if (Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) <= limit) return true
  }
  return false
}
