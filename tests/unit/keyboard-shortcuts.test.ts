import { describe, expect, it } from 'vitest'
import { resolveKeyboardShortcut } from '@/lib/board/keyboard-shortcuts'

function key(key: string, options: Partial<KeyboardEvent> = {}) {
  return resolveKeyboardShortcut({ key, ctrlKey: false, metaKey: false, shiftKey: false, target: null, ...options } as KeyboardEvent, 'dm')
}

describe('resolveKeyboardShortcut', () => {
  it.each([['v', 'select'], ['p', 'pencil'], ['e', 'eraser']])('maps %s to %s', (pressed, action) => {
    expect(key(pressed)).toEqual({ type: 'tool', tool: action })
  })

  it('does not expose a separate board-pan tool', () => {
    expect(key('h')).toBeNull()
  })

  it('maps delete and escape', () => {
    expect(key('Delete')).toEqual({ type: 'delete-selection' })
    expect(key('Escape')).toEqual({ type: 'clear-selection' })
  })

  it('maps undo and redo for Ctrl and Command', () => {
    expect(key('z', { ctrlKey: true })).toEqual({ type: 'undo' })
    expect(key('z', { metaKey: true, shiftKey: true })).toEqual({ type: 'redo' })
    expect(key('y', { ctrlKey: true })).toEqual({ type: 'redo' })
  })

  it('ignores editable targets and all player shortcuts', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as HTMLElement
    expect(key('v', { target: input })).toBeNull()
    expect(key('z', { ctrlKey: true, target: input })).toBeNull()
    expect(resolveKeyboardShortcut({ key: 'p' } as KeyboardEvent, 'player')).toBeNull()
  })
})
