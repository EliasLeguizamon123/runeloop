import { describe, expect, it } from 'vitest'
import { gesturePreviewId, resolveBackgroundGesture } from '@/lib/board/interactions'
import { panFromDrag } from '@/lib/board/coordinates'

describe('board background gestures', () => {
  it('pans from Select on empty space without changing tools', () => {
    expect(resolveBackgroundGesture('map', 'empty')).toEqual({ kind: 'pan', nextTool: 'select' })
    expect(resolveBackgroundGesture('select', 'empty')).toEqual({ kind: 'pan' })
    expect(resolveBackgroundGesture('map', 'map')).toEqual({ kind: 'map' })
    expect(resolveBackgroundGesture('map', 'token')).toEqual({ kind: 'none' })
    expect(resolveBackgroundGesture('map', 'board-image')).toEqual({ kind: 'none' })
  })

  it('pans the viewport from pointer-down to the exact pointer-up position', () => {
    expect(panFromDrag({ x: 100, y: -20 }, { x: 400, y: 300 }, { x: 187, y: 740 })).toEqual({ x: -113, y: 420 })
  })

  it('keeps object-editing tools from starting map or camera movement', () => {
    expect(resolveBackgroundGesture('pencil', 'empty')).toEqual({ kind: 'none' })
    expect(resolveBackgroundGesture('eraser', 'empty')).toEqual({ kind: 'none' })
    expect(resolveBackgroundGesture('select', 'token')).toEqual({ kind: 'none' })
  })

  it('only previews persistent objects while they are dragged', () => {
    expect(gesturePreviewId('map')).toBe('map')
    expect(gesturePreviewId('token', 'token-1')).toBe('token-1')
    expect(gesturePreviewId('board-image', 'image-1')).toBe('image-1')
    expect(gesturePreviewId('pan')).toBeUndefined()
    expect(gesturePreviewId('draw')).toBeUndefined()
    expect(gesturePreviewId('erase')).toBeUndefined()
  })
})
