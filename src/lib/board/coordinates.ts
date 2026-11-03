import type { Point, ViewportState } from '@/lib/game/types'

export function worldToScreen(point: Point, view: ViewportState): Point {
  return { x: point.x * view.zoom + view.panX, y: point.y * view.zoom + view.panY }
}
export function screenToWorld(point: Point, view: ViewportState): Point {
  return { x: (point.x - view.panX) / view.zoom, y: (point.y - view.panY) / view.zoom }
}

export function panFromDrag(origin: Point, start: Point, current: Point): Point {
  return { x: origin.x + current.x - start.x, y: origin.y + current.y - start.y }
}
