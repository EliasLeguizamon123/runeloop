import { GameClient } from '@/components/game/game-client'

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  return <GameClient roomId={roomId} />
}
