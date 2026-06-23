import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ClockSnapshot } from '@/lib/platformTypes'

const API = 'http://localhost:3000'

export interface BackendPlatformState {
  platformId: string
  name: string | null
  clock: ClockSnapshot
  votes: Record<string, string | null>
  hasCompleteVoteSet: boolean
  attemptChangeActive: boolean
}

interface UsePlatformSocketResult {
  state: BackendPlatformState | null
  connected: boolean
}

export function usePlatformSocket(
  platformId: string,
  platformName: string,
): UsePlatformSocketResult {
  const [state, setState] = useState<BackendPlatformState | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Once a real-time WS event arrives we no longer want the HTTP snapshot to
    // overwrite it — the WS payload is always at least as fresh as the ensure
    // response because the socket joined the room before the fetch resolved.
    let wsUpdated = false

    // Ensure the platform exists on the backend (creates it with virtual remotes if needed)
    fetch(`${API}/platforms/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId, name: platformName }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: BackendPlatformState) => {
        if (!wsUpdated) setState(data)
      })
      .catch(console.error)

    const socket = io(API)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join-platform', platformId)
    })

    socket.on('platform:updated', (data: BackendPlatformState) => {
      wsUpdated = true
      setState(data)
    })

    socket.on('disconnect', () => setConnected(false))

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [platformId, platformName])

  return { state, connected }
}

export function platformAction(path: string, body?: object): void {
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(console.error)
}
