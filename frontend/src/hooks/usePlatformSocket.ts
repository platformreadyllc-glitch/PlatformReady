import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const API = 'http://localhost:3000'

export interface BackendClock {
  mode: 'ACTIVE' | 'BREAK'
  state: 'IDLE' | 'RUNNING' | 'EXPIRED'
  remaining: number
  duration: number
  openingAttemptsOpen: boolean
  openingAttemptsRemaining: number | null
}

export interface BackendPlatformState {
  platformId: string
  name: string | null
  clock: BackendClock
  votes: Record<string, string | null>
  hasCompleteVoteSet: boolean
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
    // Ensure the platform exists on the backend (creates it with virtual remotes if needed)
    fetch(`${API}/platforms/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformId, name: platformName }),
    })
      .then((r) => r.json())
      .then((data: BackendPlatformState) => setState(data))
      .catch(console.error)

    const socket = io(API)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join-platform', platformId)
    })

    socket.on('platform:updated', (data: BackendPlatformState) => {
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
