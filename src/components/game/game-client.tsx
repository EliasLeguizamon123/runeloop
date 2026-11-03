'use client'

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { BoardViewport, type BoardTool } from './board/board-viewport'
import { useRealtimeRoom } from '@/hooks/use-realtime-room'
import { DICE, type Die } from '@/lib/dice/roll'
import { processImage } from '@/lib/assets/processing'
import { addDeduplicatedAsset } from '@/lib/assets/validation'
import { exportGame, importGame } from '@/lib/export/game'
import { createMonsterToken } from '@/lib/game/monster'
import type { GameAction } from '@/lib/game/types'
import { resolveKeyboardShortcut } from '@/lib/board/keyboard-shortcuts'
import { createId } from '@/lib/id'
import { Bug, Crosshair, Dices, Download, Eraser, FileUp, History, ImagePlus, Map, MousePointer2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Redo2, Trash2, Undo2, Upload, Users, type LucideIcon } from 'lucide-react'

type SidebarActionProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; variant?: 'primary' | 'secondary' | 'ghost' }

function SidebarAction({ icon: Icon, label, variant = 'ghost', className = '', ...props }: SidebarActionProps) {
  return <Button {...props} variant={variant} className={`sidebar-action ${className}`} aria-label={label} title={label}><Icon aria-hidden="true" /><span>{label}</span></Button>
}

export function GameClient({ roomId }: { roomId: string }) {
  const room = useRealtimeRoom(roomId)
  const [tool, setTool] = useState<BoardTool>('select')
  const [color, setColor] = useState('#e8c77a')
  const [width, setWidth] = useState(4)
  const [joinName, setJoinName] = useState('')
  const [die, setDie] = useState<Die>(20)
  const [count, setCount] = useState(1)
  const [selectedToken, setSelectedToken] = useState('')
  const [selectedBoardImage, setSelectedBoardImage] = useState('')
  const [boardCenter, setBoardCenter] = useState({ x: 128, y: 128 })
  const [monsterOpen, setMonsterOpen] = useState(false)
  const [monsterName, setMonsterName] = useState('')
  const [notice, setNotice] = useState('')
  const [toolsCollapsed, setToolsCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const mapInput = useRef<HTMLInputElement>(null)
  const tokenInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const deleteBoardImageRef = useRef<(id: string) => void>(() => {})
  const isDm = room.role === 'dm'
  const active = room.phase === 'active'
  const role = room.role
  const roomAction = room.action
  const roomUndo = room.undo
  const roomRedo = room.redo
  const canUndo = room.canUndo
  const canRedo = room.canRedo
  const monsters = room.game.monsters

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = resolveKeyboardShortcut(event, role)
      if (!shortcut) return
      if (shortcut.type === 'tool') { event.preventDefault(); setTool(shortcut.tool); return }
      if (shortcut.type === 'undo') { event.preventDefault(); if (canUndo) { roomUndo(); setNotice('Deshacer.') } else setNotice('No hay cambios para deshacer.'); return }
      if (shortcut.type === 'redo') { event.preventDefault(); if (canRedo) { roomRedo(); setNotice('Rehacer.') } else setNotice('No hay cambios para rehacer.'); return }
      if (shortcut.type === 'clear-selection') { setSelectedToken(''); setSelectedBoardImage(''); return }
      if (shortcut.type === 'delete-selection' && isDm && selectedBoardImage) { event.preventDefault(); deleteBoardImageRef.current(selectedBoardImage); return }
      if (shortcut.type === 'delete-selection' && isDm && selectedToken && monsters.some(token => token.id === selectedToken)) {
        event.preventDefault(); roomAction({ type: 'monster:deleted', id: selectedToken }); setSelectedToken('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [role, monsters, roomAction, roomUndo, roomRedo, canUndo, canRedo, isDm, selectedToken, selectedBoardImage])
  useEffect(() => { deleteBoardImageRef.current = deleteBoardImage })

  function onJoin(event: FormEvent) { event.preventDefault(); room.join(joinName) }
  function addMonster(event: FormEvent) {
    event.preventDefault()
    try { room.action({ type: 'monster:created', token: createMonsterToken(monsterName) }); setMonsterOpen(false); setMonsterName('') }
    catch (error) { setNotice((error as Error).message) }
  }
  async function loadImage(event: ChangeEvent<HTMLInputElement>, kind: 'map' | 'token' | 'board-image') {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const assetKind = kind === 'map' ? 'map' : 'token'
      const result = await processImage(file, assetKind)
      const unique = await addDeduplicatedAsset(room.game, result.asset, assetKind)
      const changes: GameAction[] = unique.added ? [{ type: 'asset:added', asset: result.asset }] : []
      if (kind === 'map') {
        const oldId = room.game.board.map?.assetId
        changes.push({ type: 'map:updated', map: { assetId: unique.id, x: 0, y: 0, width: result.width, height: result.height } })
        if (oldId && oldId !== unique.id && ![...room.game.players, ...room.game.monsters].some(token => token.assetId === oldId) && !room.game.board.images.some(image => image.assetId === oldId)) changes.push({ type: 'asset:deleted', id: oldId })
        room.transaction(changes, 'Cambiar mapa')
      }
      else if (kind === 'board-image') {
        const scale = Math.min(1, 256 / Math.max(result.width, result.height))
        const image = { id: createId(), assetId: unique.id, width: Math.max(1, result.width * scale), height: Math.max(1, result.height * scale), x: boardCenter.x, y: boardCenter.y }
        changes.push({ type: 'board-image:created', image }); room.transaction(changes, 'Agregar imagen al tablero'); setSelectedBoardImage(image.id); setSelectedToken(''); setTool('select')
      }
      else if (selectedToken) { changes.push({ type: room.game.players.some(t => t.id === selectedToken) ? 'player:image' : 'monster:image', id: selectedToken, assetId: unique.id }); room.transaction(changes, 'Cambiar imagen del token') }
      setNotice('Imagen cargada.')
    } catch (error) { setNotice((error as Error).message) }
  }
  function exportJson() {
    try {
      const json = exportGame(room.game)
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `dnd-table-${new Date().toISOString().slice(0, 10)}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setNotice((error as Error).message) }
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { setNotice('El JSON supera 15 MB.'); return }
    try { const state = importGame(await file.text()); room.replace(state); setNotice('Partida importada.') }
    catch (error) { setNotice((error as Error).message) }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setNotice('Link copiado.') }
    catch { setNotice('No se pudo copiar el link.') }
  }
  function action(value: GameAction) { room.action(value) }
  function deleteBoardImage(id: string) {
    const image = room.game.board.images.find(item => item.id === id)
    if (!image) return
    const stillUsed = room.game.board.map?.assetId === image.assetId || room.game.board.images.some(item => item.id !== id && item.assetId === image.assetId) || [...room.game.players, ...room.game.monsters].some(token => token.assetId === image.assetId)
    const changes: GameAction[] = [{ type: 'board-image:deleted', id }]
    if (!stillUsed) changes.push({ type: 'asset:deleted', id: image.assetId })
    room.transaction(changes, 'Eliminar imagen del tablero')
    setSelectedBoardImage('')
    setNotice('Imagen eliminada.')
  }
  if (room.phase === 'error') return <motion.main className="center-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h1>La sala no puede abrirse</h1><p>{room.error}</p><Link href="/">Volver</Link></motion.main>
  if (room.phase === 'unavailable') return <motion.main className="center-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h1>Esta partida no está disponible.</h1><p>El DM todavía no inició la sala o la partida ya terminó.</p><Button onClick={room.retry}>Reintentar</Button><Link href="/">Crear otra sala</Link></motion.main>
  if (room.phase === 'ended') return <motion.main className="center-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h1>La partida terminó</h1><p>El DM se desconectó.</p><Link href="/">Crear otra sala</Link></motion.main>
  if (room.phase === 'join') return <motion.main className="center-state" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}><form className="join-card" onSubmit={onJoin}><span className="eyebrow">Sala {roomId}</span><h1>Ingresá tu nombre</h1><label htmlFor="player-name">Nombre</label><input id="player-name" value={joinName} onChange={event => setJoinName(event.target.value)} maxLength={24} minLength={2} required autoFocus /><Button type="submit">Entrar</Button>{room.error && <p role="alert">{room.error}</p>}</form></motion.main>
  if (room.phase === 'connecting' || room.phase === 'syncing' && !room.name && !isDm) return <motion.main className="center-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><h1>Entrando a la partida…</h1><p>{room.error || 'Sincronizando sala y mapa.'}</p></motion.main>

  return <motion.main className="game-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }}>
    <header className="game-header"><div className="game-brand"><Image src="/favicon_io/android-chrome-192x192.png" alt="" width={36} height={36} /><div><span className="brand-name">RuneLoop</span><strong>Sala {roomId}</strong></div></div><div className="header-actions"><span className="online-count">{room.people.filter(p => p.role === 'player').length} jugadores</span>{isDm && <Button variant="secondary" onClick={copyLink}>Copiar link</Button>}</div></header>
    <div className={`game-main ${isDm ? '' : 'game-main-player'} ${toolsCollapsed ? 'game-main-tools-collapsed' : ''} ${sidebarCollapsed ? 'game-main-sidebar-collapsed' : ''}`}>
      {isDm && <aside className={`dm-tools ${toolsCollapsed ? 'is-collapsed' : ''}`} aria-label="Herramientas del DM">
        <div className="sidebar-heading">{!toolsCollapsed && <h2>Herramientas</h2>}<Button className="sidebar-toggle" variant="ghost" aria-label={toolsCollapsed ? 'Expandir herramientas' : 'Comprimir herramientas'} aria-expanded={!toolsCollapsed} title={toolsCollapsed ? 'Expandir herramientas' : 'Comprimir herramientas'} onClick={() => setToolsCollapsed(value => !value)}>{toolsCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}</Button></div>
        <div className="sidebar-content">
        <SidebarAction icon={MousePointer2} label="Seleccionar" aria-pressed={tool === 'select'} variant={tool === 'select' ? 'primary' : 'ghost'} onClick={() => setTool('select')} />
        <SidebarAction icon={Map} label="Mover mapa" aria-pressed={tool === 'map'} variant={tool === 'map' ? 'primary' : 'ghost'} onClick={() => setTool('map')} />
        <SidebarAction icon={Pencil} label="Lápiz" aria-pressed={tool === 'pencil'} variant={tool === 'pencil' ? 'primary' : 'ghost'} onClick={() => setTool('pencil')} />
        <SidebarAction icon={Eraser} label="Borrador" aria-pressed={tool === 'eraser'} variant={tool === 'eraser' ? 'primary' : 'ghost'} onClick={() => setTool('eraser')} />
        <SidebarAction icon={Crosshair} label="Ping" aria-pressed={tool === 'ping'} variant={tool === 'ping' ? 'primary' : 'ghost'} onClick={() => setTool('ping')} />
        {tool === 'pencil' && <div className="draw-options"><label>Color <input aria-label="Color del lápiz" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Grosor <input aria-label="Grosor del lápiz" type="range" min="1" max="12" value={width} onChange={event => setWidth(Number(event.target.value))} /></label></div>}
        <div className="tool-divider" />
        <SidebarAction icon={Upload} label="Cargar mapa" onClick={() => mapInput.current?.click()} />
        <SidebarAction icon={ImagePlus} label="Agregar imagen al tablero" onClick={() => document.getElementById('board-image-input')?.click()} />
        {selectedBoardImage && <SidebarAction icon={Trash2} label="Eliminar imagen seleccionada" onClick={() => deleteBoardImage(selectedBoardImage)} />}
        <SidebarAction icon={Trash2} label="Quitar mapa" disabled={!room.game.board.map} onClick={() => { const oldId = room.game.board.map?.assetId; const changes: GameAction[] = [{ type: 'map:updated', map: null }]; if (oldId && ![...room.game.players, ...room.game.monsters].some(token => token.assetId === oldId) && !room.game.board.images.some(image => image.assetId === oldId)) changes.push({ type: 'asset:deleted', id: oldId }); room.transaction(changes, 'Quitar mapa') }} />
        <SidebarAction icon={Bug} label="Crear monstruo" onClick={() => setMonsterOpen(true)} />
        {selectedToken && <SidebarAction icon={Upload} label="Imagen del token" onClick={() => tokenInput.current?.click()} />}
        {selectedToken && room.game.monsters.some(t => t.id === selectedToken) && <SidebarAction icon={Trash2} label="Borrar monstruo" onClick={() => { action({ type: 'monster:deleted', id: selectedToken }); setSelectedToken('') }} />}
        <div className="tool-divider" />
        <SidebarAction icon={Download} label="Exportar JSON" onClick={exportJson} />
        <SidebarAction icon={Undo2} label="Deshacer" disabled={!room.canUndo} onClick={() => room.undo()} />
        <SidebarAction icon={Redo2} label="Rehacer" disabled={!room.canRedo} onClick={() => room.redo()} />
        <SidebarAction icon={FileUp} label="Importar JSON" onClick={() => importInput.current?.click()} />
        <input ref={mapInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void loadImage(event, 'map')} />
        <input ref={tokenInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void loadImage(event, 'token')} />
        <input id="board-image-input" hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void loadImage(event, 'board-image')} />
        <input ref={importInput} hidden type="file" accept="application/json,.json" onChange={event => void importJson(event)} />
        </div>
      </aside>}
      <section className="board-area"><BoardViewport game={room.game} role={room.role} active={active} ownTokenId={room.tokenId} tool={tool} onToolChange={setTool} color={color} width={width} pings={room.pings} pointers={room.pointers} locks={room.locks} clientId={room.clientId} onRequestTokenLock={room.requestTokenLock} onReleaseTokenLock={room.releaseTokenLock} onAction={action} onTransaction={room.transaction} onPing={room.ping} onPointer={room.pointer} onSelectToken={setSelectedToken} selectedTokenId={selectedToken} selectedBoardImageId={selectedBoardImage} onSelectBoardImage={setSelectedBoardImage} onCenterChange={setBoardCenter} />{room.phase === 'waiting' && <div className="pause-overlay">Esperando al DM…</div>}{room.phase === 'syncing' && <div className="pause-overlay">Cargando mapa…</div>}</section>
      <aside className={`game-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="sidebar-heading">{!sidebarCollapsed && <h2><Users aria-hidden="true" /> En la mesa</h2>}<Button className="sidebar-toggle" variant="ghost" aria-label={sidebarCollapsed ? 'Expandir panel lateral' : 'Comprimir panel lateral'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expandir panel lateral' : 'Comprimir panel lateral'} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? <PanelRightOpen aria-hidden="true" /> : <PanelRightClose aria-hidden="true" />}</Button></div>
        {!sidebarCollapsed && <div className="sidebar-content">
          <ul className="people-list"><li>DM {room.people.some(p => p.role === 'dm') ? '●' : '○'}</li>{room.people.filter(p => p.role === 'player').map(p => <li key={p.clientId}>{p.name}</li>)}</ul>
          <div className="tool-divider" />
          <section className="sidebar-section"><h2><Dices aria-hidden="true" /> Dados</h2><div className="dice-form"><label>Tipo <select value={die} onChange={event => setDie(Number(event.target.value) as Die)}>{DICE.map(value => <option key={value} value={value}>d{value}</option>)}</select></label><label>Cantidad <input type="number" min="1" max="20" value={count} onChange={event => setCount(Number(event.target.value))} /></label><Button disabled={!active || count < 1 || count > 20 || !Number.isInteger(count)} onClick={() => room.roll(count, die)}>Tirar</Button></div></section>
          <div className="tool-divider" />
          <section className="sidebar-section"><h2><History aria-hidden="true" /> Historial</h2><ol className="dice-history"><AnimatePresence initial={false}>{room.diceHistory.map(roll => <motion.li key={roll.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .14 }}><strong>{roll.name}</strong> {roll.values.length}d{roll.die} → {roll.values.join(' · ')}</motion.li>)}</AnimatePresence></ol></section>
          <div className="tool-divider" />
        </div>}
        {sidebarCollapsed && <ul className="people-collapsed" aria-label="Integrantes"><li title="DM" aria-label="DM">D</li>{room.people.filter(p => p.role === 'player').map(person => <li key={person.clientId} title={person.name} aria-label={person.name}>{person.name.trim().charAt(0).toUpperCase()}</li>)}</ul>}
      </aside>
    </div>
    <footer className="game-footer"><span>{room.phase === 'active' ? 'En vivo' : room.phase === 'waiting' ? 'Esperando al DM…' : 'Sincronizando…'}</span><AnimatePresence mode="wait"><motion.span key={notice || room.error} role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .12 }}>{notice || room.error}</motion.span></AnimatePresence></footer>
    {!isDm && <nav className="mobile-actions" aria-label="Acciones del jugador"><Button variant={tool === 'ping' ? 'primary' : 'secondary'} onClick={() => setTool(tool === 'ping' ? 'select' : 'ping')}>Ping</Button><Button variant="secondary" onClick={() => document.querySelector('.game-sidebar')?.scrollIntoView({ behavior: 'smooth' })}>Dados</Button></nav>}
    <Dialog open={monsterOpen} onOpenChange={setMonsterOpen}><DialogContent><DialogTitle>Crear monstruo</DialogTitle><form onSubmit={addMonster}><label htmlFor="monster-name">Nombre</label><input id="monster-name" value={monsterName} onChange={event => setMonsterName(event.target.value)} maxLength={64} required autoFocus /><div className="dialog-actions"><Button type="button" variant="ghost" onClick={() => setMonsterOpen(false)}>Cancelar</Button><Button type="submit">Crear monstruo</Button></div></form></DialogContent></Dialog>
  </motion.main>
}
