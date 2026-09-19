import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ClockSnapshot } from '@/lib/platformTypes'

// Backend base URL. VITE_API_URL overrides this when set (see
// frontend/.env.example) - needed for unusual setups (backend on a
// non-standard port, or on a different host than the one serving this
// frontend entirely). Otherwise, derived automatically from whatever host
// this page was itself loaded from, on the backend's fixed port 3000
// (backend/src/main.ts) - this is what makes "same page, any computer on
// the LAN" work with no configuration: a browser on another computer
// necessarily already reached this frontend via the host machine's real
// LAN address (window.location.hostname), not literally "localhost" -
// hardcoding that word here instead, as this used to, resolved to each
// browser's own machine, not the host's, breaking every socket connection
// and API call from any computer other than the host.
const inferredApiOrigin = `${window.location.protocol}//${window.location.hostname}:3000`
export const API = import.meta.env.VITE_API_URL ?? inferredApiOrigin

// Only the fields consumed on the frontend, out of the full RemoteSerialized
// the backend actually sends (backend/src/platform/models/remote.ts).
export interface BackendRemote {
  remoteId: string
  role: string
  connected: boolean
  transport: 'wifi' | 'ethernet' | null
}

export interface BackendPlatformState {
  platformId: string
  name: string | null
  clock: ClockSnapshot
  votes: Record<string, string | null>
  hasCompleteVoteSet: boolean
  attemptChangeActive: boolean
  activeRemotes: Record<string, BackendRemote>
}

interface UsePlatformSocketResult {
  state: BackendPlatformState | null
  connected: boolean | null
}

export function usePlatformSocket(
  platformId: string,
  platformName: string,
): UsePlatformSocketResult {
  const [state, setState] = useState<BackendPlatformState | null>(null)
  const [connected, setConnected] = useState<boolean | null>(null)
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

    const socket = io(API, { forceNew: true })
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

export function platformAction(path: string, body?: object, method = 'POST'): void {
  fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(console.error)
}
