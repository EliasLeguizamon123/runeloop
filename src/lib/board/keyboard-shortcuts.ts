import type { BoardTool } from '@/components/game/board/board-viewport'

export type KeyboardShortcut =
  | { type: 'tool'; tool: BoardTool }
  | { type: 'undo' | 'redo' | 'delete-selection' | 'clear-selection' }

function isEditable(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object' || !('tagName' in target)) return false
  const element = target as HTMLElement
  return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || Boolean(element.closest?.('[contenteditable="true"], [role="dialog"] [data-text-entry]'))
}

export function resolveKeyboardShortcut(event: KeyboardEvent, role: 'dm' | 'player'): KeyboardShortcut | null {
  if (role !== 'dm' || isEditable(event.target)) return null
  const key = event.key.toLowerCase()
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return { type: event.shiftKey ? 'redo' : 'undo' }
    if (key === 'y' && !event.shiftKey) return { type: 'redo' }
    return null
  }
  if (event.altKey || event.shiftKey) return null
  const tools: Record<string, BoardTool> = { v: 'select', p: 'pencil', e: 'eraser' }
  if (tools[key]) return { type: 'tool', tool: tools[key] }
  if (event.key === 'Delete' || event.key === 'Backspace') return { type: 'delete-selection' }
  if (event.key === 'Escape') return { type: 'clear-selection' }
  return null
}
