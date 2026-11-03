const hostedRooms = new Set<string>()

export function markHost(roomId: string): void {
  hostedRooms.add(roomId)
}

export function isHost(roomId: string): boolean {
  return hostedRooms.has(roomId)
}

export function clearHost(roomId: string): void {
  hostedRooms.delete(roomId)
}
