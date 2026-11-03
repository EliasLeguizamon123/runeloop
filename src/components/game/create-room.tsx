'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createRoomId } from '@/lib/room/id'
import { markHost } from '@/lib/room/host'

export function CreateRoom() {
  const router = useRouter()
  return <Button onClick={() => {
    const roomId = createRoomId()
    markHost(roomId)
    router.push(`/room/${roomId}`)
  }}>Crear sala</Button>
}
