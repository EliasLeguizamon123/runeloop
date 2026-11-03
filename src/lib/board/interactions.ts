export type BoardTool = 'select' | 'map' | 'pencil' | 'eraser' | 'ping'
export type BoardTarget = 'empty' | 'map' | 'token' | 'board-image'
export type BackgroundGesture = { kind: 'none' | 'pan' | 'map'; nextTool?: 'select' }
export type BoardGestureKind = 'token' | 'map' | 'board-image' | 'pan' | 'draw' | 'erase'

export function gesturePreviewId(kind: BoardGestureKind, id?: string): string | undefined {
  if (kind === 'map') return 'map'
  if (kind === 'board-image' || kind === 'token') return id
}

export function resolveBackgroundGesture(tool: BoardTool, target: BoardTarget): BackgroundGesture {
  if (tool === 'map') {
    if (target === 'map') return { kind: 'map' }
    if (target === 'empty') return { kind: 'pan', nextTool: 'select' }
    return { kind: 'none' }
  }
  if (tool === 'select' && target === 'empty') return { kind: 'pan' }
  return { kind: 'none' }
}
