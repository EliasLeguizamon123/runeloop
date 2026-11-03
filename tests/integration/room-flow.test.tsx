// @vitest-environment jsdom
import { beforeAll, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { useRealtimeRoom } from '@/hooks/use-realtime-room'
import { markHost } from '@/lib/room/host'
import { exportGame, importGame } from '@/lib/export/game'
import { PNG_1X1 } from '../fixtures/image'
import { createEmptyGame } from '@/lib/game/state'
import { createId } from '@/lib/id'
import { chunkText, makeSyncManifest } from '@/lib/realtime/sync'

const channels = new Set<FakeChannel>()
class FakeChannel {
  dropNextMove = false
  dropSyncRequests = false
  presence: { clientId: string; role: string; name: string } | null = null
  broadcasts: ((message: { payload: unknown }) => void)[] = []
  presenceHandlers: (() => void)[] = []
  on(kind: string, _filter: unknown, callback: (message: { payload: unknown }) => void) {
    if (kind === 'broadcast') this.broadcasts.push(callback)
    else this.presenceHandlers.push(() => callback({ payload: null }))
    return this
  }
  subscribe(callback: (status: string) => void) { channels.add(this); queueMicrotask(() => callback('SUBSCRIBED')); return this }
  async track(value: { clientId: string; role: string; name: string }) { this.presence = value; for (const channel of channels) for (const handler of channel.presenceHandlers) handler(); return 'ok' }
  presenceState() { return Object.fromEntries([...channels].filter(c => c.presence).map(c => [c.presence!.clientId, [{ ...c.presence, presence_ref: 'ref' }]])) }
  async send(message: { payload: unknown }) {
    const envelope = message.payload as { message?: { type?: string } }
    if (this.dropNextMove && envelope.message?.type === 'game:action-request') { this.dropNextMove = false; return 'ok' }
    if (this.dropSyncRequests && envelope.message?.type === 'game:request-sync') return 'ok'
    for (const channel of channels) if (channel !== this) queueMicrotask(() => channel.broadcasts.forEach(handler => handler(message)))
    return 'ok'
  }
  async untrack() { this.presence = null; for (const channel of channels) for (const handler of channel.presenceHandlers) handler() }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ channel: () => new FakeChannel(), removeChannel: async (channel: FakeChannel) => { channels.delete(channel) } }) }))

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
})

it('admits a player, syncs the board, and authorizes the final token move', async () => {
  const id = createId()
  markHost(id)
  let dm!: ReturnType<typeof useRealtimeRoom>
  let player!: ReturnType<typeof useRealtimeRoom>
  const hostView = render(<Host />)
  function Host() { dm = useRealtimeRoom(id); return <span>{dm.phase}</span> }
  function Player() { player = useRealtimeRoom(id); return <span>{player.phase}</span> }
  await waitFor(() => expect(dm.phase).toBe('active'))
  const playerView = render(<Player />)
  await waitFor(() => expect(player.phase).toBe('join'))
  player.join('Juan')
  await waitFor(() => expect(player.phase).toBe('active'))
  await waitFor(() => expect(dm.game.players).toHaveLength(1))
  const playerChannel = [...channels].find(channel => channel.presence?.role === 'player')!
  const firstLock = await player.requestTokenLock(player.tokenId)
  expect(firstLock).toBeTruthy()
  await waitFor(() => expect(dm.locks.some(lock => lock.tokenId === player.tokenId)).toBe(true))
  await waitFor(() => expect(player.locks.some(lock => lock.tokenId === player.tokenId)).toBe(true))
  expect(await dm.requestTokenLock(player.tokenId)).toBeNull()
  player.retry()
  await waitFor(() => expect(player.locks.some(lock => lock.tokenId === player.tokenId)).toBe(true))
  player.action({ type: 'player:moved', id: player.tokenId, x: 280, y: 200 })
  await waitFor(() => expect(dm.game.players[0]).toMatchObject({ x: 280, y: 200 }))
  await waitFor(() => expect(player.game.players[0]).toMatchObject({ x: 280, y: 200 }))
  await waitFor(() => expect(dm.locks.some(lock => lock.tokenId === player.tokenId)).toBe(false))
  dm.action({ type: 'monster:created', token: { id: 'goblin', name: 'Goblin', x: 60, y: 70 } })
  await waitFor(() => expect(player.game.monsters[0].name).toBe('Goblin'))
  const monsterLock = await dm.requestTokenLock('goblin')
  expect(monsterLock).toBeTruthy()
  dm.action({ type: 'monster:moved', id: 'goblin', x: 90, y: 70 })
  await waitFor(() => expect(player.game.monsters[0].x).toBe(90))
  dm.action({ type: 'drawing:added', stroke: { id: 'stroke', points: [{ x: 1, y: 2 }, { x: 10, y: 20 }], color: '#ffffff', width: 4 } })
  await waitFor(() => expect(player.game.board.drawings).toHaveLength(1))
  dm.action({ type: 'drawing:removed', id: 'stroke' })
  await waitFor(() => expect(player.game.board.drawings).toHaveLength(0))
  const imageAsset = { id: 'board-image-asset', mimeType: 'image/png' as const, data: PNG_1X1 }
  const boardImage = { id: 'board-image', assetId: imageAsset.id, x: 125, y: 135, width: 80, height: 60 }
  dm.transaction([{ type: 'asset:added', asset: imageAsset }, { type: 'board-image:created', image: boardImage }], 'add board image')
  await waitFor(() => expect(player.game.board.images).toEqual([boardImage]))
  await waitFor(() => expect(player.game.assets.some(asset => asset.id === imageAsset.id)).toBe(true))
  expect(dm.canUndo).toBe(true)
  dm.undo()
  await waitFor(() => expect(player.game.board.images).toHaveLength(0))
  expect(dm.canRedo).toBe(true)
  dm.redo()
  await waitFor(() => expect(player.game.board.images).toEqual([boardImage]))
  dm.action({ type: 'board-image:moved', id: boardImage.id, x: 180, y: 190 })
  await waitFor(() => expect(player.game.board.images[0]).toMatchObject({ x: 180, y: 190 }))
  dm.transaction([{ type: 'board-image:deleted', id: boardImage.id }, { type: 'asset:deleted', id: imageAsset.id }], 'delete board image')
  await waitFor(() => expect(player.game.board.images).toHaveLength(0))
  await waitFor(() => expect(player.game.assets.some(asset => asset.id === imageAsset.id)).toBe(false))
  player.roll(2, 6)
  await waitFor(() => expect(dm.diceHistory).toHaveLength(1))
  await waitFor(() => expect(player.diceHistory[0].values).toEqual(dm.diceHistory[0].values))
  player.ping({ x: 44, y: 55 })
  await waitFor(() => expect(dm.pings[0]).toMatchObject({ x: 44, y: 55, name: 'Juan' }))
  player.pointer({ x: 70, y: 80 })
  await waitFor(() => expect(dm.pointers[0]).toMatchObject({ x: 70, y: 80, name: 'Juan' }))
  const unchanged = dm.game
  expect(() => dm.replace({ ...dm.game, version: 99 } as never)).toThrow()
  expect(dm.game).toBe(unchanged)
  expect(dm.canUndo).toBe(true)
  dm.replace(importGame(exportGame(dm.game)))
  await waitFor(() => expect(dm.canUndo).toBe(false))
  await waitFor(() => expect(dm.canRedo).toBe(false))
  await waitFor(() => expect(player.game.monsters[0].x).toBe(90))
  const hostChannel = [...channels].find(channel => channel.presence?.role === 'dm')!
  const hostPresence = hostChannel.presence!
  const reconnectLock = await dm.requestTokenLock('goblin')
  expect(reconnectLock).toBeTruthy()
  await waitFor(() => expect(player.locks.some(lock => lock.tokenId === 'goblin')).toBe(true))
  await hostChannel.untrack()
  await waitFor(() => expect(player.phase).toBe('waiting'))
  await hostChannel.track(hostPresence)
  await waitFor(() => expect(player.phase).toBe('active'))
  await waitFor(() => expect(player.locks).toEqual([]))
  dm.action({ type: 'asset:added', asset: { id: 'map-image', mimeType: 'image/png', data: PNG_1X1 } })
  dm.action({ type: 'map:updated', map: { assetId: 'map-image', x: 0, y: 0, width: 100, height: 100 } })
  await waitFor(() => expect(player.game.board.map?.assetId).toBe('map-image'))
  expect(player.game.assets[0]?.data).toBe(PNG_1X1)
  dm.replace({ ...dm.game, players: [{ id: 'new-juan', name: 'Juan', x: 500, y: 500 }] })
  await waitFor(() => expect(player.tokenId).toBe('new-juan'))
  const secondLock = await player.requestTokenLock(player.tokenId)
  expect(secondLock).toBeTruthy()
  player.action({ type: 'player:moved', id: player.tokenId, x: 510, y: 520 })
  await waitFor(() => expect(dm.game.players[0]).toMatchObject({ x: 510, y: 520 }))
  await playerChannel.send({ payload: { roomId: id, protocolVersion: 1, message: { type: 'game:action-request', senderId: playerChannel.presence!.clientId, requestId: 'stale-move', sequence: 1, action: { type: 'player:moved', id: player.tokenId, x: 0, y: 0 } } } })
  await Promise.resolve()
  expect(dm.game.players[0]).toMatchObject({ x: 510, y: 520 })
  const staleText = JSON.stringify(makeSyncManifest(createEmptyGame()))
  const staleChunks = chunkText(staleText)
  playerChannel.dropSyncRequests = true
  await act(async () => {
    await hostChannel.send({ payload: { roomId: id, protocolVersion: 1, message: { type: 'game:sync', senderId: hostPresence.clientId, targetId: playerChannel.presence!.clientId, transferId: 'stale', revision: 0, length: staleText.length, total: staleChunks.length } } })
    for (const chunk of staleChunks) await hostChannel.send({ payload: { roomId: id, protocolVersion: 1, message: { type: 'game:sync-chunk', senderId: hostPresence.clientId, targetId: playerChannel.presence!.clientId, transferId: 'stale', ...chunk } } })
  })
  expect(player.game.players[0]).toMatchObject({ x: 510, y: 520 })
  playerChannel.dropSyncRequests = false
  vi.useFakeTimers()
  await act(async () => { await hostChannel.untrack(); await vi.advanceTimersByTimeAsync(60000) })
  expect(player.phase).toBe('ended')
  await act(async () => { await hostChannel.track(hostPresence) })
  expect(player.phase).toBe('ended')
  await act(async () => { player.retry(); await vi.advanceTimersByTimeAsync(0) })
  expect(player.phase).toBe('ended')
  vi.useRealTimers()
  playerView.unmount(); hostView.unmount()
})
