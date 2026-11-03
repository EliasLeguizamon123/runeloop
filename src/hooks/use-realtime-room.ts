'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { clearHost, isHost } from '@/lib/room/host'
import { admitPlayer, releasePlayer, validatePlayerName } from '@/lib/realtime/admission'
import { fitsBroadcastBudget, unwrapRealtimeMessage, type RealtimeEvent } from '@/lib/realtime/events'
import { makeSyncManifest, restoreSyncState, chunkText, assembleText, fingerprint, type SyncManifest, type TextChunk } from '@/lib/realtime/sync'
import { assembleAsset, chunkAsset, type AssetChunk } from '@/lib/assets/chunking'
import { applyGameAction, canMoveToken, claimPlayerToken, createEmptyGame } from '@/lib/game/state'
import { parseGameState } from '@/lib/game/schema'
import { rollDice } from '@/lib/dice/roll'
import type { DiceRoll, GameAction, GameState, Point } from '@/lib/game/types'
import { createId } from '@/lib/id'
import { expireTokenLocks, grantTokenLock, releaseTokenLock as releaseLock, renewTokenLock, type TokenLock } from '@/lib/session/token-locks'
import { createHistory, recordGameChange, redoGameChange, undoGameChange, type HistoryState } from '@/lib/game/history'

export type RoomPhase = 'connecting' | 'unavailable' | 'join' | 'syncing' | 'active' | 'waiting' | 'ended' | 'error'
export type RoomRole = 'dm' | 'player'
type Presence = { clientId: string; role: RoomRole; name: string }
type InboundSync = { chunks: TextChunk[]; total: number; length: number; revision: number; timer: ReturnType<typeof setTimeout> }
type InboundAsset = { chunks: AssetChunk[]; total: number; length: number }

export function useRealtimeRoom(roomId: string) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME'))
  const [role] = useState<RoomRole>(() => isHost(roomId) ? 'dm' : 'player')
  const [phase, setPhase] = useState<RoomPhase>(() => configured ? 'connecting' : 'error')
  const [error, setError] = useState(() => configured ? '' : 'Configurá Supabase Realtime para abrir una sala.')
  const [game, setGame] = useState<GameState>(createEmptyGame)
  const [people, setPeople] = useState<Presence[]>([])
  const [name, setName] = useState('')
  const [tokenId, setTokenId] = useState('')
  const [diceHistory, setDiceHistory] = useState<DiceRoll[]>([])
  const [pings, setPings] = useState<(Point & { id: string; name: string })[]>([])
  const [pointers, setPointers] = useState<(Point & { clientId: string; name: string })[]>([])
  const [locks, setLocks] = useState<TokenLock[]>([])
  const [clientId] = useState(createId)
  const [historyReady, setHistoryReady] = useState({ canUndo: false, canRedo: false })
  const api = useRef<null | {
    join: (name: string) => void; action: (action: GameAction) => void
    requestTokenLock: (tokenId: string) => Promise<string | null>; commitTokenMove: (tokenId: string, lockId: string, point: Point) => void; releaseTokenLock: (tokenId: string, lockId: string) => void
    transaction: (actions: GameAction[], label: string) => void; undo: () => void; redo: () => void
    roll: (count: number, die: number) => void; ping: (point: Point) => void
    pointer: (point: Point) => void; replace: (state: GameState) => void; retry: () => void
  }>(null)

  useEffect(() => {
    const dm = role === 'dm'
    if (dm) clearHost(roomId)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key || key.includes('REPLACE_ME')) return
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const channel = supabase.channel(`room:${roomId}`, { config: { private: false, broadcast: { ack: true }, presence: { key: clientId } } })
    let disposed = false
    let hostId = dm ? clientId : ''
    let ownName = dm ? 'DM' : ''
    let ownTokenId = ''
    let state = createEmptyGame()
    let revision = 0
    let admitted: Record<string, string> = {}
    let owners: Record<string, string> = {}
    let tokenLocks: TokenLock[] = []
    let history: HistoryState = createHistory()
    const lockWaiters = new Map<string, { resolve: (id: string | null) => void; timer: ReturnType<typeof setTimeout> }>()
    const pendingCommitTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const heldLocks = new Map<string, string>()
    const lockHeartbeat = setInterval(() => {
      if (dm) {
        const now = Date.now()
        const expired = tokenLocks.filter(lock => lock.expiresAt <= now)
        tokenLocks = expireTokenLocks(tokenLocks, now).map(lock => lock.clientId === clientId ? { ...lock, expiresAt: now + 8000 } : lock)
        for (const lock of expired) void send({ type: 'token:lock-release', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
      }
      setLocks(tokenLocks)
      for (const lock of tokenLocks) if (lock.clientId === clientId) void send({ type: 'token:lock-heartbeat', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
    }, 2000)
    let active = false
    let ended = false
    let hostWasAbsent = false
    let grace: ReturnType<typeof setTimeout> | undefined
    let unavailable: ReturnType<typeof setTimeout> | undefined
    let snapshot: SyncManifest | undefined
    let snapshotRevision = 0
    let newestSnapshotRevision = 0
    const syncs = new Map<string, InboundSync>()
    const assets = new Map<string, InboundAsset>()
    const seenRequests = new Set<string>()
    const reservations = new Map<string, ReturnType<typeof setTimeout>>()
    const requestedAssets = new Map<string, ReturnType<typeof setTimeout>>()
    const lastMoveSequence: Record<string, number> = {}
    let nextMoveSequence = 0
    const pingTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const pointerTimers = new Map<string, ReturnType<typeof setTimeout>>()
    let latestRevisionSeen = 0
    const assetCache: Record<string, string> = {}
    let pointerAt = 0

    function updateState(next: GameState) { state = next; setGame(next) }
    function updateHistory(next: HistoryState) { history = next; setHistoryReady({ canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 }) }
    async function send(message: RealtimeEvent): Promise<boolean> {
      if (disposed) return false
      const payload = { roomId, protocolVersion: 1, message }
      if (!fitsBroadcastBudget(payload)) { setError('El cambio supera el tamaño seguro de Realtime.'); return false }
      try {
        const result = await channel.send({ type: 'broadcast', event: 'room', payload })
        if (result === 'ok') return true
      } catch { /* The caller or reconnect flow handles retries. */ }
      setError('No se pudo enviar el cambio. Reintentá.')
      return false
    }
    function present(): Presence[] {
      return (Object.values(channel.presenceState()).flat() as unknown[]).filter((entry): entry is Presence =>
        typeof entry === 'object' && entry !== null && 'clientId' in entry && 'role' in entry && 'name' in entry && typeof entry.clientId === 'string' && (entry.role === 'dm' || entry.role === 'player') && typeof entry.name === 'string')
    }
    function requestSync() { if (!ended && hostId) void send({ type: 'game:request-sync', senderId: clientId, targetId: hostId }) }
    function syncLocks(targetId?: string) { void send({ type: 'token:locks-sync', senderId: clientId, targetId: targetId ?? clientId, locks: tokenLocks.filter(lock => lock.expiresAt > Date.now()) }) }
    function requestTokenLock(tokenId: string): Promise<string | null> {
      if (!active || !(dm ? canMoveToken(state, tokenId, clientId, owners, true) : tokenId === ownTokenId)) return Promise.resolve(null)
      const lockId = createId(), requestId = createId()
      if (dm) {
        const result = grantTokenLock(tokenLocks, { tokenId, lockId, clientId, name: ownName }, Date.now())
        tokenLocks = result.locks; setLocks(tokenLocks)
        if (result.result !== 'granted') return Promise.resolve(null)
        void send({ type: 'token:lock-granted', senderId: clientId, requestId, lock: tokenLocks[tokenLocks.length - 1] })
        heldLocks.set(tokenId, lockId)
        return Promise.resolve(lockId)
      }
      return new Promise(resolve => {
        const timer = setTimeout(() => { lockWaiters.delete(requestId); resolve(null) }, 3000)
        lockWaiters.set(requestId, { resolve, timer })
        void send({ type: 'token:lock-request', senderId: clientId, requestId, tokenId, lockId, name: ownName })
      })
    }
    function releaseTokenLockForClient(tokenId: string, lockId: string) {
      if (dm) {
        const lock = tokenLocks.find(item => item.tokenId === tokenId && item.lockId === lockId && item.clientId === clientId)
        if (!lock) return
        tokenLocks = releaseLock(tokenLocks, tokenId, lockId); setLocks(tokenLocks)
      }
      heldLocks.delete(tokenId)
      void send({ type: 'token:lock-release', senderId: clientId, tokenId, lockId })
    }
    function commitTokenMove(tokenId: string, lockId: string, point: Point) {
      const token = [...state.players, ...state.monsters].find(item => item.id === tokenId)
      if (!token) return
      if (dm) {
        const lock = tokenLocks.find(item => item.tokenId === tokenId && item.lockId === lockId && item.clientId === clientId && item.expiresAt > Date.now())
        if (!lock) return
        commit(state.players.some(item => item.id === tokenId) ? { type: 'player:moved', id: tokenId, ...point } : { type: 'monster:moved', id: tokenId, ...point })
        releaseTokenLockForClient(tokenId, lockId)
      } else {
        const requestId = createId()
        updateState(applyGameAction(state, state.players.some(item => item.id === tokenId)
          ? { type: 'player:moved', id: tokenId, ...point }
          : { type: 'monster:moved', id: tokenId, ...point }))
        void send({ type: 'token:move-commit', senderId: clientId, requestId, sequence: ++nextMoveSequence, tokenId, lockId, ...point }).then(ok => { if (!ok) requestSync() })
        pendingCommitTimers.set(requestId, setTimeout(() => { pendingCommitTimers.delete(requestId); requestSync() }, 2000))
      }
    }
    function requestAsset(assetId: string) {
      if (requestedAssets.has(assetId) || !hostId) return
      void send({ type: 'asset:request', senderId: clientId, targetId: hostId, assetId })
      requestedAssets.set(assetId, setTimeout(() => { requestedAssets.delete(assetId); if (snapshot) requestAsset(assetId) }, 5000))
    }
    async function sendSync(targetId?: string) {
      const text = JSON.stringify(makeSyncManifest(state))
      const chunks = chunkText(text)
      const transferId = createId()
      await send({ type: 'game:sync', senderId: clientId, targetId, transferId, revision, length: text.length, total: chunks.length })
      for (const chunk of chunks) await send({ type: 'game:sync-chunk', senderId: clientId, targetId, transferId, ...chunk })
      if (targetId) syncLocks(targetId)
    }
    function tryReady() {
      if (!snapshot || ended) return
      if (snapshotRevision < revision || snapshotRevision < newestSnapshotRevision) { snapshot = undefined; return }
      const missing = snapshot.assets.filter(item => assetCache[item.id]?.length !== item.length || fingerprint(assetCache[item.id]) !== item.fingerprint)
      if (missing.length) {
        for (const item of missing) if (!assets.has(item.id)) requestAsset(item.id)
        setPhase('syncing')
        return
      }
      try {
        const restored = restoreSyncState(snapshot, assetCache)
        const ownedToken = restored.players.find(token => token.name === ownName)
        if (ownedToken) { ownTokenId = ownedToken.id; setTokenId(ownedToken.id) }
        updateState(restored)
        revision = snapshotRevision
        snapshot = undefined
        setPhase('active')
        if (latestRevisionSeen > revision) requestSync()
      } catch { setError('No se pudo reconstruir la partida.'); requestSync() }
    }
    function commit(action: GameAction, requestId = createId()) {
      if (!dm || !active) return
      const before = state
      const next = applyGameAction(state, action)
      updateState(next)
      updateHistory(recordGameChange(history, before, next, action.type.replaceAll(':', ' ')))
      revision++
      if (action.type === 'asset:added') {
        assetCache[action.asset.id] = action.asset.data
        void sendSync()
      } else void send({ type: 'game:action', senderId: clientId, requestId, revision, action }).then(ok => { if (!ok) void sendSync() })
    }
    function transaction(actions: GameAction[], label: string) {
      if (!dm || !active || !actions.length) return
      const before = state
      const next = actions.reduce(applyGameAction, before)
      updateState(next)
      updateHistory(recordGameChange(history, before, next, label))
      for (const action of actions) if (action.type === 'asset:added') assetCache[action.asset.id] = action.asset.data
      revision++
      void sendSync()
    }
    function changeHistory(direction: 'undo' | 'redo') {
      if (!dm || !active) return
      const change = direction === 'undo' ? undoGameChange(history) : redoGameChange(history)
      if (!change) return
      updateHistory(change.history); updateState(change.state); revision++
      for (const lock of tokenLocks) void send({ type: 'token:lock-release', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
      tokenLocks = []; heldLocks.clear(); setLocks([])
      void sendSync()
    }
    function addRoll(roll: DiceRoll) { setDiceHistory(previous => [roll, ...previous].slice(0, 50)) }
    function rollAsDm(count: number, die: number, roller: string) {
      try {
        const roll: DiceRoll = { id: createId(), name: roller, die: die as DiceRoll['die'], values: rollDice(count, die) }
        addRoll(roll)
        void send({ type: 'dice:rolled', senderId: clientId, roll })
      } catch { setError('Tirada inválida.') }
    }
    function addPing(senderId: string, id: string, x: number, y: number, displayName?: string) {
      const ping = { id, x, y, name: displayName ?? (senderId === clientId ? ownName : admitted[senderId] ?? 'DM') }
      setPings(previous => [...previous, ping])
      pingTimers.set(id, setTimeout(() => { pingTimers.delete(id); setPings(previous => previous.filter(item => item.id !== id)) }, 2200))
    }
    function updatePointer(pointer: Point & { clientId: string; name: string }) {
      setPointers(previous => [...previous.filter(item => item.clientId !== pointer.clientId), pointer])
      const previousTimer = pointerTimers.get(pointer.clientId)
      if (previousTimer) clearTimeout(previousTimer)
      pointerTimers.set(pointer.clientId, setTimeout(() => {
        pointerTimers.delete(pointer.clientId)
        setPointers(previous => previous.filter(item => item.clientId !== pointer.clientId))
      }, 1800))
    }
    async function handle(raw: unknown) {
      const event = unwrapRealtimeMessage(raw, roomId)
      if (!event) return
      if (ended) return
      if (event.senderId === clientId) return
      if ('targetId' in event && event.targetId && event.targetId !== clientId) return
      if (dm) {
        switch (event.type) {
          case 'player:join-request': {
            const result = admitPlayer(admitted, event.senderId, event.name)
            if (result.reason) { void send({ type: 'player:join-rejected', senderId: clientId, targetId: event.senderId, reason: result.reason }); break }
            admitted = result.active
            if (!reservations.has(event.senderId)) reservations.set(event.senderId, setTimeout(() => {
              reservations.delete(event.senderId)
              if (!present().some(person => person.clientId === event.senderId)) {
                admitted = releasePlayer(admitted, event.senderId)
                owners = Object.fromEntries(Object.entries(owners).filter(([, value]) => value !== event.senderId))
              }
            }, 10000))
            const joined = claimPlayerToken(state, event.name.trim())
            if (joined.state !== state) commit({ type: 'player:created', token: joined.token })
            owners[joined.token.id] = event.senderId
            void send({ type: 'player:join-accepted', senderId: clientId, targetId: event.senderId, name: event.name.trim(), tokenId: joined.token.id })
            break
          }
          case 'game:request-sync': void sendSync(event.senderId); break
          case 'token:lock-request': {
            if (!admitted[event.senderId] || !canMoveToken(state, event.tokenId, event.senderId, owners)) break
            const result = grantTokenLock(tokenLocks, { tokenId: event.tokenId, lockId: event.lockId, clientId: event.senderId, name: admitted[event.senderId] }, Date.now())
            tokenLocks = result.locks; setLocks(tokenLocks)
            if (result.result === 'granted') void send({ type: 'token:lock-granted', senderId: clientId, requestId: event.requestId, lock: tokenLocks[tokenLocks.length - 1] })
            else void send({ type: 'token:lock-rejected', senderId: clientId, targetId: event.senderId, requestId: event.requestId, tokenId: event.tokenId, holderName: result.holderName ?? 'otro participante' })
            break
          }
          case 'token:lock-heartbeat': {
            const lock = tokenLocks.find(item => item.tokenId === event.tokenId && item.lockId === event.lockId && item.clientId === event.senderId)
            if (!lock) break
            tokenLocks = renewTokenLock(tokenLocks, { ...event, clientId: event.senderId }, Date.now()); setLocks(tokenLocks)
            const renewed = tokenLocks.find(item => item.tokenId === event.tokenId)
            if (renewed) void send({ type: 'token:lock-granted', senderId: clientId, requestId: 'heartbeat', lock: renewed })
            break
          }
          case 'token:lock-release': {
            const lock = tokenLocks.find(item => item.tokenId === event.tokenId && item.lockId === event.lockId && item.clientId === event.senderId)
            if (!lock) break
            tokenLocks = releaseLock(tokenLocks, event.tokenId, event.lockId); setLocks(tokenLocks)
            void send({ ...event, senderId: clientId })
            break
          }
          case 'token:move-commit': {
            if (seenRequests.has(event.requestId) || event.sequence <= (lastMoveSequence[event.senderId] ?? 0)) break
            const lock = tokenLocks.find(item => item.tokenId === event.tokenId && item.lockId === event.lockId && item.clientId === event.senderId && item.expiresAt > Date.now())
            if (!lock || !canMoveToken(state, event.tokenId, event.senderId, owners)) break
            seenRequests.add(event.requestId); lastMoveSequence[event.senderId] = event.sequence
            commit(state.players.some(item => item.id === event.tokenId) ? { type: 'player:moved', id: event.tokenId, x: event.x, y: event.y } : { type: 'monster:moved', id: event.tokenId, x: event.x, y: event.y }, event.requestId)
            tokenLocks = releaseLock(tokenLocks, event.tokenId, event.lockId); setLocks(tokenLocks)
            void send({ type: 'token:lock-release', senderId: clientId, tokenId: event.tokenId, lockId: event.lockId })
            break
          }
          case 'game:action-request': break
          case 'dice:roll-request': if (admitted[event.senderId]) rollAsDm(event.count, event.die, admitted[event.senderId]); break
          case 'asset:request': {
            const asset = state.assets.find(item => item.id === event.assetId)
            if (!asset) break
            const chunks = chunkAsset(asset.id, asset.data)
            for (const chunk of chunks) await send({ type: 'asset:chunk', senderId: clientId, targetId: event.senderId, length: asset.data.length, ...chunk })
            break
          }
          case 'ping:created': if (admitted[event.senderId]) { addPing(event.senderId, event.id, event.x, event.y); void send({ ...event, senderId: clientId, name: admitted[event.senderId] }) }; break
          case 'pointer:moved': if (admitted[event.senderId]) { updatePointer({ clientId: event.senderId, name: admitted[event.senderId], x: event.x, y: event.y }); void send({ ...event, senderId: clientId, clientId: event.senderId, name: admitted[event.senderId] }) }; break
        }
      } else {
        if (event.type === 'player:join-accepted' && event.targetId === clientId) {
          hostId = event.senderId; ownName = event.name; ownTokenId = event.tokenId; active = true
          setName(ownName); setTokenId(ownTokenId); setPhase('syncing')
          await channel.track({ clientId, role: 'player', name: ownName })
          requestSync()
          return
        }
        if (event.type === 'player:join-rejected' && event.targetId === clientId) { setError(event.reason); setPhase('join'); return }
        if (event.senderId !== hostId || !hostId) return
        switch (event.type) {
          case 'game:sync': {
            if (event.revision < revision || event.revision < newestSnapshotRevision) break
            newestSnapshotRevision = event.revision
            syncs.set(event.transferId, { chunks: [], total: event.total, length: event.length, revision: event.revision, timer: setTimeout(() => { syncs.delete(event.transferId); setError('Falló la sincronización. Reintentá.'); requestSync() }, 5000) })
            setPhase('syncing')
            break
          }
          case 'game:sync-chunk': {
            const transfer = syncs.get(event.transferId)
            if (!transfer) break
            transfer.chunks.push({ index: event.index, total: event.total, data: event.data })
            if (transfer.chunks.length === transfer.total) {
              clearTimeout(transfer.timer)
              syncs.delete(event.transferId)
              try { snapshot = JSON.parse(assembleText(transfer.chunks, transfer.length)) as SyncManifest; snapshotRevision = transfer.revision; tryReady() }
              catch { setError('Falló la sincronización. Reintentá.'); requestSync() }
            }
            break
          }
          case 'token:lock-granted': {
            tokenLocks = [...tokenLocks.filter(lock => lock.tokenId !== event.lock.tokenId), event.lock]; setLocks(tokenLocks)
            const waiter = lockWaiters.get(event.requestId)
            if (waiter) { clearTimeout(waiter.timer); lockWaiters.delete(event.requestId); heldLocks.set(event.lock.tokenId, event.lock.lockId); waiter.resolve(event.lock.lockId) }
            break
          }
          case 'token:lock-rejected': {
            const waiter = lockWaiters.get(event.requestId)
            if (waiter) { clearTimeout(waiter.timer); lockWaiters.delete(event.requestId); waiter.resolve(null); setError(`${event.holderName} está moviendo esa ficha.`) }
            break
          }
          case 'token:lock-release': tokenLocks = releaseLock(tokenLocks, event.tokenId, event.lockId); heldLocks.delete(event.tokenId); setLocks(tokenLocks); break
          case 'token:locks-sync': tokenLocks = event.locks; for (const id of heldLocks.keys()) if (!event.locks.some(lock => lock.tokenId === id && lock.clientId === clientId)) heldLocks.delete(id); setLocks(tokenLocks); break
          case 'asset:chunk': {
            const transfer = assets.get(event.assetId) ?? { chunks: [], total: event.total, length: event.length }
            if (!transfer.chunks.some(chunk => chunk.index === event.index)) transfer.chunks.push({ assetId: event.assetId, index: event.index, total: event.total, data: event.data })
            assets.set(event.assetId, transfer)
            if (transfer.chunks.length === transfer.total) {
              assets.delete(event.assetId)
              const requestTimer = requestedAssets.get(event.assetId)
              if (requestTimer) clearTimeout(requestTimer)
              requestedAssets.delete(event.assetId)
              try { assetCache[event.assetId] = assembleAsset(transfer.chunks, transfer.length); tryReady() }
              catch { setError('Falló la transferencia del asset. Reintentá.'); requestAsset(event.assetId) }
            }
            break
          }
          case 'game:action': {
            const pendingTimer = pendingCommitTimers.get(event.requestId)
            if (pendingTimer) { clearTimeout(pendingTimer); pendingCommitTimers.delete(event.requestId) }
            latestRevisionSeen = Math.max(latestRevisionSeen, event.revision)
            if (snapshot || syncs.size) { requestSync(); break }
            if (event.revision !== revision + 1) { requestSync(); break }
            if (event.action.type === 'asset:added') { requestSync(); break }
            updateState(applyGameAction(state, event.action)); revision = event.revision
            break
          }
          case 'dice:rolled': addRoll(event.roll); break
          case 'game:ended': ended = true; setPhase('ended'); break
        }
      }
      if (event.type === 'ping:created' && !dm) addPing(event.senderId, event.id, event.x, event.y, event.name)
      if (event.type === 'pointer:moved' && !dm) updatePointer({ clientId: event.clientId ?? event.senderId, name: event.name ?? 'DM', x: event.x, y: event.y })
    }
    function onPresence() {
      const current = present()
      setPeople(current)
      if (dm) {
        const ids = new Set(current.filter(p => p.role === 'player').map(p => p.clientId))
        const hostPresent = current.some(person => person.clientId === clientId && person.role === 'dm')
        if (!hostPresent) {
          hostWasAbsent = true
          const heldByDm = tokenLocks.filter(lock => lock.clientId === clientId)
          tokenLocks = tokenLocks.filter(lock => lock.clientId !== clientId); setLocks(tokenLocks)
          for (const lock of heldByDm) void send({ type: 'token:lock-release', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
          return
        }
        if (hostWasAbsent) {
          hostWasAbsent = false
          for (const lock of tokenLocks) void send({ type: 'token:lock-release', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
          tokenLocks = []; heldLocks.clear(); setLocks([])
        }
        for (const id of ids) {
          const reservation = reservations.get(id)
          if (reservation) { clearTimeout(reservation); reservations.delete(id) }
        }
        for (const id of Object.keys(admitted)) if (!ids.has(id) && !reservations.has(id)) { admitted = releasePlayer(admitted, id); owners = Object.fromEntries(Object.entries(owners).filter(([, value]) => value !== id)) }
        const disconnected = tokenLocks.filter(lock => !ids.has(lock.clientId))
        tokenLocks = tokenLocks.filter(lock => ids.has(lock.clientId)); setLocks(tokenLocks)
        for (const lock of disconnected) void send({ type: 'token:lock-release', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
        return
      }
      const host = current.find(p => p.role === 'dm')
      if (host) {
        if (ended) return
        if (unavailable) { clearTimeout(unavailable); unavailable = undefined }
        const wasWaiting = Boolean(grace)
        if (grace) { clearTimeout(grace); grace = undefined }
        const changed = hostId !== host.clientId
        hostId = host.clientId
        if (ownName && (changed || wasWaiting)) { setPhase('syncing'); requestSync() }
        else if (!ownName) setPhase('join')
      } else if (ownName) {
        setPhase('waiting')
        if (!grace) grace = setTimeout(() => { ended = true; setPhase('ended'); grace = undefined }, 60000)
      } else if (!unavailable) unavailable = setTimeout(() => { setPhase('unavailable'); unavailable = undefined }, 1500)
    }
    channel.on('broadcast', { event: 'room' }, ({ payload }) => { void handle(payload) })
      .on('presence', { event: 'sync' }, onPresence)
    channel.subscribe(async status => {
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        if (dm) {
          active = true
          tokenLocks = []; heldLocks.clear(); setLocks([])
          await channel.track({ clientId, role: 'dm', name: 'DM' })
          setPhase('active')
        } else {
          onPresence()
          if (ownName) { await channel.track({ clientId, role: 'player', name: ownName }); void send({ type: 'player:join-request', senderId: clientId, requestId: createId(), name: ownName }); requestSync() }
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        active = false
        setError('Se perdió la conexión con Realtime. Reconectando…')
        setPhase(dm ? 'error' : ownName ? 'waiting' : 'unavailable')
      }
    })
    const visible = () => { if (!ended && !document.hidden && !dm && ownName && hostId) requestSync() }
    document.addEventListener('visibilitychange', visible)
    api.current = {
      join(raw) {
        try { const valid = validatePlayerName(raw); setError(''); setPhase('syncing'); void send({ type: 'player:join-request', senderId: clientId, requestId: createId(), name: valid }).then(ok => { if (!ok) setPhase('join') }) }
        catch (issue) { setError((issue as Error).message) }
      },
      action(action) {
        if (action.type === 'player:moved' || action.type === 'monster:moved') {
          const lockId = heldLocks.get(action.id)
          if (lockId) commitTokenMove(action.id, lockId, { x: action.x, y: action.y })
          return
        }
        if (dm) commit(action)
      },
      requestTokenLock,
      commitTokenMove,
      releaseTokenLock: releaseTokenLockForClient,
      roll(count, die) { if (dm) rollAsDm(count, die, 'DM'); else void send({ type: 'dice:roll-request', senderId: clientId, requestId: createId(), count, die }) },
      ping(point) { const id = createId(); addPing(clientId, id, point.x, point.y); void send({ type: 'ping:created', senderId: clientId, id, ...point }) },
      pointer(point) { if (performance.now() - pointerAt < 50) return; pointerAt = performance.now(); void send({ type: 'pointer:moved', senderId: clientId, ...point }) },
      replace(next) {
        if (!dm) return
        let restored = parseGameState(next)
        for (const lock of tokenLocks) void send({ type: 'token:lock-release', senderId: clientId, tokenId: lock.tokenId, lockId: lock.lockId })
        tokenLocks = []; heldLocks.clear(); setLocks([])
        owners = {}
        for (const [id, playerName] of Object.entries(admitted)) {
          const joined = claimPlayerToken(restored, playerName)
          restored = joined.state
          owners[joined.token.id] = id
        }
        updateState(restored); updateHistory(createHistory()); revision++; void sendSync()
      },
      transaction,
      undo() { changeHistory('undo') },
      redo() { changeHistory('redo') },
      retry() { if (ended) return; onPresence(); if (ownName) requestSync() },
    }
    return () => {
      disposed = true
      active = false
      if (grace) clearTimeout(grace)
      if (unavailable) clearTimeout(unavailable)
      for (const timer of pingTimers.values()) clearTimeout(timer)
      for (const timer of pointerTimers.values()) clearTimeout(timer)
      for (const timer of reservations.values()) clearTimeout(timer)
      for (const timer of requestedAssets.values()) clearTimeout(timer)
      clearInterval(lockHeartbeat)
      for (const waiter of lockWaiters.values()) { clearTimeout(waiter.timer); waiter.resolve(null) }
      lockWaiters.clear()
      for (const timer of pendingCommitTimers.values()) clearTimeout(timer)
      pendingCommitTimers.clear()
      tokenLocks = []; setLocks([])
      for (const transfer of syncs.values()) clearTimeout(transfer.timer)
      document.removeEventListener('visibilitychange', visible)
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [roomId, role, clientId])

  return { role, phase, error, game, people, name, tokenId, diceHistory, pings, pointers,
    join: (value: string) => api.current?.join(value),
    action: (value: GameAction) => api.current?.action(value), locks, clientId,
    canUndo: historyReady.canUndo, canRedo: historyReady.canRedo,
    transaction: (actions: GameAction[], label: string) => api.current?.transaction(actions, label),
    undo: () => api.current?.undo(), redo: () => api.current?.redo(),
    requestTokenLock: (tokenId: string) => api.current?.requestTokenLock(tokenId) ?? Promise.resolve(null),
    commitTokenMove: (tokenId: string, lockId: string, point: Point) => api.current?.commitTokenMove(tokenId, lockId, point),
    releaseTokenLock: (tokenId: string, lockId: string) => api.current?.releaseTokenLock(tokenId, lockId),
    roll: (count: number, die: number) => api.current?.roll(count, die),
    ping: (point: Point) => api.current?.ping(point),
    pointer: (point: Point) => api.current?.pointer(point),
    replace: (value: GameState) => api.current?.replace(value),
    retry: () => api.current?.retry(),
  }
}
