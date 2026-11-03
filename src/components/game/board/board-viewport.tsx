'use client'
/* eslint-disable @next/next/no-img-element -- Board images are client-generated data URLs. */

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { GameAction, GameState, Point, ViewportState } from '@/lib/game/types'
import { panFromDrag, screenToWorld, worldToScreen } from '@/lib/board/coordinates'
import { gesturePreviewId, resolveBackgroundGesture, type BoardTarget, type BoardTool } from '@/lib/board/interactions'
import { strokeIntersectsPoint } from '@/lib/game/drawing'
import { createId } from '@/lib/id'
import type { TokenLock } from '@/lib/session/token-locks'

export type { BoardTool } from '@/lib/board/interactions'
type Props = {
  game: GameState; role: 'dm' | 'player'; active: boolean; ownTokenId: string; tool: BoardTool
  color: string; width: number; pings: (Point & { id: string; name: string })[]
  pointers: (Point & { clientId: string; name: string })[]
  onAction: (action: GameAction) => void; onTransaction?: (actions: GameAction[], label: string) => void; onPing: (point: Point) => void; onPointer: (point: Point) => void
  onSelectToken: (id: string) => void; selectedTokenId?: string; onSelectBoardImage?: (id: string) => void; selectedBoardImageId?: string; onCenterChange?: (point: Point) => void
  locks?: TokenLock[]; clientId?: string; onRequestTokenLock?: (id: string) => Promise<string | null>; onReleaseTokenLock?: (id: string, lockId: string) => void
  onToolChange?: (tool: BoardTool) => void
}
type Gesture = { kind: 'token' | 'map' | 'board-image' | 'pan' | 'draw' | 'erase'; id?: string; start: Point; origin: Point; points: Point[]; ids?: string[] }

export function BoardViewport({ game, role, active, ownTokenId, tool, color, width, pings, pointers, onAction, onTransaction, onPing, onPointer, onSelectToken, selectedTokenId, onSelectBoardImage, selectedBoardImageId, onCenterChange, locks = [], clientId = '', onRequestTokenLock, onReleaseTokenLock, onToolChange }: Props) {
  const board = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 })
  const reducedMotion = useReducedMotion()
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [preview, setPreview] = useState<Record<string, Point>>({})
  const fingers = useRef(new Map<number, Point>())
  const pinch = useRef<{ distance: number; zoom: number; center: Point; world: Point } | null>(null)
  const dragLock = useRef<{ id: string; lockId?: string; pending: boolean; cancelled: boolean } | null>(null)
  const assets = new Map(game.assets.map(asset => [asset.id, `data:${asset.mimeType};base64,${asset.data}`]))

  useEffect(() => {
    const element = board.current
    if (!element || !onCenterChange) return
    const report = () => { const rect = element.getBoundingClientRect(); onCenterChange(screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, view)) }
    report()
    const observer = new ResizeObserver(report); observer.observe(element)
    return () => observer.disconnect()
  }, [view, onCenterChange])
  useEffect(() => {
    function cancel(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !gesture) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      const lock = dragLock.current
      if (lock) { lock.cancelled = true; if (lock.lockId) onReleaseTokenLock?.(lock.id, lock.lockId) }
      dragLock.current = null; setGesture(null); setPreview({})
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [gesture, onReleaseTokenLock])

  function local(event: { clientX: number; clientY: number }): Point {
    const rect = board.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  function world(event: { clientX: number; clientY: number }): Point { return screenToWorld(local(event), view) }
  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const center = local(event)
    const before = screenToWorld(center, view)
    const zoom = Math.max(.25, Math.min(3, view.zoom * Math.exp(-event.deltaY * .001)))
    setView({ zoom, panX: center.x - before.x * zoom, panY: center.y - before.y * zoom })
  }
  function onDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'touch') fingers.current.set(event.pointerId, local(event))
    if (fingers.current.size === 2) {
      const [a, b] = [...fingers.current.values()]
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom, center, world: screenToWorld(center, view) }
      setGesture(null); return
    }
    const point = world(event)
    if (tool === 'ping') { if (active) onPing(point); return }
    if (role === 'dm' && active && tool === 'pencil') { setGesture({ kind: 'draw', start: point, origin: point, points: [point] }); event.currentTarget.setPointerCapture(event.pointerId); return }
    if (role === 'dm' && active && tool === 'eraser') { setGesture({ kind: 'erase', start: point, origin: point, points: [point], ids: erase(point) }); event.currentTarget.setPointerCapture(event.pointerId); return }
    const imageTarget = (event.target as HTMLElement).closest<HTMLElement>('[data-board-image-id]')
    const imageId = imageTarget?.dataset.boardImageId
    if (imageId && tool === 'select') {
      const image = game.board.images.find(item => item.id === imageId)
      onSelectBoardImage?.(imageId); onSelectToken('')
      if (role === 'dm' && active && image) {
        setGesture({ kind: 'board-image', id: imageId, start: point, origin: { x: image.x, y: image.y }, points: [] })
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      return
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-token-id]')
    const id = target?.dataset.tokenId
    if (id && tool === 'select') {
      onSelectToken(id)
      onSelectBoardImage?.('')
      if (locks.some(lock => lock.tokenId === id && lock.clientId !== clientId)) return
      if (active && (role === 'dm' || id === ownTokenId)) {
        const token = [...game.players, ...game.monsters].find(t => t.id === id)!
        dragLock.current = { id, pending: false, cancelled: false }
        setGesture({ kind: 'token', id, start: point, origin: { x: token.x, y: token.y }, points: [] })
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      return
    }
    if (tool === 'select') { onSelectToken(''); onSelectBoardImage?.('') }
    const targetKind: BoardTarget = (event.target as HTMLElement).closest('.board-map') ? 'map' : id ? 'token' : imageId ? 'board-image' : 'empty'
    const backgroundGesture = resolveBackgroundGesture(tool, targetKind)
    if (backgroundGesture.nextTool) onToolChange?.(backgroundGesture.nextTool)
    if (backgroundGesture.kind === 'none') return
    const map = game.board.map
    if (backgroundGesture.kind === 'map' && role === 'dm' && active && map) {
      setGesture({ kind: 'map', start: point, origin: { x: map.x, y: map.y }, points: [] })
    } else {
      setGesture({ kind: 'pan', start: local(event), origin: { x: view.panX, y: view.panY }, points: [] })
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function erase(point: Point): string[] {
    return game.board.drawings.filter(stroke => strokeIntersectsPoint(stroke, point, 8 / view.zoom)).map(stroke => stroke.id)
  }
  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (fingers.current.has(event.pointerId)) fingers.current.set(event.pointerId, local(event))
    if (pinch.current && fingers.current.size === 2) {
      const [a, b] = [...fingers.current.values()]
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const zoom = Math.max(.25, Math.min(3, pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.current.distance || 1)))
      setView({ zoom, panX: center.x - pinch.current.world.x * zoom, panY: center.y - pinch.current.world.y * zoom })
      return
    }
    if (!gesture) { if (event.pointerType === 'mouse' && active) onPointer(world(event)); return }
    const point = world(event)
    if (gesture.kind === 'pan') {
      const pan = panFromDrag(gesture.origin, gesture.start, local(event))
      setView(v => ({ ...v, panX: pan.x, panY: pan.y }))
    }
    if (gesture.kind === 'token' && dragLock.current && !dragLock.current.lockId && !dragLock.current.pending && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 5 / view.zoom) {
      dragLock.current.pending = true
      const request = onRequestTokenLock?.(gesture.id!)
      if (request) void request.then(lockId => {
        const current = dragLock.current
        if (!current || current.id !== gesture.id) { if (lockId) onReleaseTokenLock?.(gesture.id!, lockId); return }
        current.pending = false
        if (!lockId) { setGesture(null); setPreview({}); return }
        current.lockId = lockId
        if (current.cancelled) { onReleaseTokenLock?.(current.id, lockId); dragLock.current = null }
      })
    }
    const previewId = gesture.kind === 'token' && !dragLock.current?.lockId ? undefined : gesturePreviewId(gesture.kind, gesture.id)
    if (previewId) setPreview(previous => ({ ...previous, [previewId]: { x: gesture.origin.x + point.x - gesture.start.x, y: gesture.origin.y + point.y - gesture.start.y } }))
    if (gesture.kind === 'draw') {
      const last = gesture.points.at(-1)!
      if (Math.hypot(point.x - last.x, point.y - last.y) >= 2 / view.zoom) setGesture({ ...gesture, points: [...(gesture.points.length >= 2000 ? gesture.points.filter((_, index) => index % 2 === 0) : gesture.points), point] })
    }
    if (gesture.kind === 'erase') setGesture({ ...gesture, ids: [...new Set([...(gesture.ids ?? []), ...erase(point)])] })
  }
  function onUp(event: PointerEvent<HTMLDivElement>) {
    fingers.current.delete(event.pointerId)
    if (fingers.current.size < 2) pinch.current = null
    if (!gesture) return
    const point = world(event)
    if (gesture.kind === 'pan') {
      const pan = event.type === 'pointercancel' ? gesture.origin : panFromDrag(gesture.origin, gesture.start, local(event))
      setView(v => ({ ...v, panX: pan.x, panY: pan.y }))
    }
    if (gesture.kind === 'token' && gesture.id) {
      const token = [...game.players, ...game.monsters].find(t => t.id === gesture.id)
      const lock = dragLock.current
      if (event.type !== 'pointercancel' && token && lock?.lockId && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 5 / view.zoom) onAction({ type: game.players.some(t => t.id === gesture.id) ? 'player:moved' : 'monster:moved', id: gesture.id, x: gesture.origin.x + point.x - gesture.start.x, y: gesture.origin.y + point.y - gesture.start.y })
      else if (lock) { lock.cancelled = true; if (lock.lockId) onReleaseTokenLock?.(lock.id, lock.lockId) }
      dragLock.current = null
    }
    if (gesture.kind === 'map' && game.board.map) onAction({ type: 'map:updated', map: { ...game.board.map, x: gesture.origin.x + point.x - gesture.start.x, y: gesture.origin.y + point.y - gesture.start.y } })
    if (gesture.kind === 'board-image' && gesture.id && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 0.5) onAction({ type: 'board-image:moved', id: gesture.id, x: gesture.origin.x + point.x - gesture.start.x, y: gesture.origin.y + point.y - gesture.start.y })
    if (gesture.kind === 'draw' && gesture.points.length > 1) onAction({ type: 'drawing:added', stroke: { id: createId(), points: [...gesture.points, point], color, width } })
    if (gesture.kind === 'erase' && event.type !== 'pointercancel' && gesture.ids?.length) {
      const actions = gesture.ids.map(id => ({ type: 'drawing:removed' as const, id }))
      if (onTransaction) onTransaction(actions, 'Borrar trazos'); else actions.forEach(onAction)
    }
    setGesture(null); setPreview({})
  }
  useEffect(() => {
    const element = canvas.current, parent = board.current
    if (!element || !parent) return
    const paint = () => {
      const pixelRatio = window.devicePixelRatio || 1
      element.width = parent.clientWidth * pixelRatio; element.height = parent.clientHeight * pixelRatio
      const context = element.getContext('2d')!
      context.scale(pixelRatio, pixelRatio)
      for (const stroke of [...game.board.drawings.filter(stroke => !gesture?.ids?.includes(stroke.id)), ...(gesture?.kind === 'draw' ? [{ id: 'draft', points: gesture.points, color, width }] : [])]) {
        if (!stroke.points.length) continue
        context.beginPath()
        stroke.points.forEach((point, index) => { const screen = worldToScreen(point, view); if (index === 0) context.moveTo(screen.x, screen.y); else context.lineTo(screen.x, screen.y) })
        context.strokeStyle = stroke.color; context.lineWidth = stroke.width * view.zoom; context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke()
      }
    }
    paint()
    const observer = new ResizeObserver(paint); observer.observe(parent)
    return () => observer.disconnect()
  }, [game.board.drawings, gesture, view, color, width])
  const map = game.board.map
  return <div ref={board} className={`board board-tool-${tool}`} aria-label="Tablero" onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
    <div className="world" style={{ transform: `translate(${view.panX}px,${view.panY}px) scale(${view.zoom})` }}>
      {map && assets.has(map.assetId) && <img className="board-map" src={assets.get(map.assetId)} alt="Mapa de la partida" draggable={false} style={{ left: preview.map?.x ?? map.x, top: preview.map?.y ?? map.y, width: map.width, height: map.height }} />}
      <AnimatePresence>{game.board.images.map(image => assets.has(image.assetId) && <motion.img key={image.id} data-board-image-id={image.id} className={`board-image ${image.id === selectedBoardImageId ? 'board-image-selected' : ''}`} src={assets.get(image.assetId)} alt="Imagen del tablero" draggable={false} initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }} style={{ left: preview[image.id]?.x ?? image.x, top: preview[image.id]?.y ?? image.y, width: image.width, height: image.height }} />)}</AnimatePresence>
      {[...game.players.map(t => ({ ...t, kind: 'player' as const })), ...game.monsters.map(t => ({ ...t, kind: 'monster' as const }))].map(token => { const lock = locks.find(item => item.tokenId === token.id); return <motion.div key={token.id} data-token-id={token.id} className={`token token-${token.kind} ${token.id === ownTokenId ? 'token-own' : ''} ${token.id === selectedTokenId ? 'token-selected' : ''} ${lock ? 'token-locked' : ''}`} aria-label={lock ? `${token.name}, moviendo ${lock.name}` : token.name} initial={false} animate={{ left: preview[token.id]?.x ?? token.x, top: preview[token.id]?.y ?? token.y }} transition={{ duration: reducedMotion || gesture?.kind === 'token' ? 0 : .16 }}>
        <span className="token-face">{token.assetId && assets.has(token.assetId) ? <img src={assets.get(token.assetId)} alt="" draggable={false} /> : token.name.charAt(0).toUpperCase()}</span><span className="token-name">{token.name}</span>
      </motion.div>})}
    </div>
    <canvas ref={canvas} className="drawing-canvas" aria-hidden="true" />
    {pings.map(ping => { const at = worldToScreen(ping, view); return <div key={ping.id} className="board-ping" style={{ left: at.x, top: at.y }}><span />{ping.name}</div> })}
    {pointers.map(pointer => { const at = worldToScreen(pointer, view); return <div key={pointer.clientId} className="board-pointer" style={{ left: at.x, top: at.y }}>◆ {pointer.name}</div> })}
    <div className="board-zoom">{Math.round(view.zoom * 100)}%</div>
  </div>
}
