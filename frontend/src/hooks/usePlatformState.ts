import { useEffect, useRef, useState } from 'react'
import { dayLabel } from '@/lib/platformHelpers'
import {
  INITIAL_CLOCK,
  INITIAL_VOTES,
  KEY_MAP,
  OPENER_LOCK_CUTOFF,
  STORAGE_KEY,
  type ClockSnapshot,
  type Role,
  type StoredMeetConfig,
  type VoteButton,
} from '@/lib/platformTypes'
import { usePlatformSocket, platformAction } from '@/hooks/usePlatformSocket'

export interface PlatformConfig {
  platformName: string
  dayStr: string
  configFound: boolean
}

export interface PlatformState {
  config: PlatformConfig
  votes: Record<Role, VoteButton | null>
  revealed: boolean
  clock: ClockSnapshot
  connected: boolean | null
  attemptChangeActive: boolean
  startBreakCountdown: (minutes: 10 | 20) => void
  toggleAttemptChange: () => void
}

const BACKEND_URL_ID = (id: string) => `platform-${id}`

/**
 * @param id          Platform route param (1-based string)
 * @param inputEnabled Pass false to suppress keyboard handling (e.g. while a modal is open)
 */
export function usePlatformState(id: string | undefined, inputEnabled = true): PlatformState {
  const numericId = id ?? '1'
  const platformId = BACKEND_URL_ID(numericId)
  const platformIndex = Number(numericId) - 1

  // ── Config from localStorage ─────────────────────────────────────────────
  let platformName = ''
  let dayStr = 'Day 1'
  let configFound = false

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const config: StoredMeetConfig = JSON.parse(raw)
      const platform = config.days[0]?.platforms[platformIndex]
      if (platform?.active) {
        configFound = true
        platformName = platform.name || `Platform ${numericId}`
        dayStr = dayLabel(config.startDate, 0)
      }
    }
  } catch {
    // ignore malformed data
  }

  // ── Backend state via WebSocket ───────────────────────────────────────────
  const { state: backendState, connected } = usePlatformSocket(platformId, platformName)

  // ── Frontend-only display state ───────────────────────────────────────────
  const [revealed, setRevealed] = useState(false)
  const [localRemaining, setLocalRemaining] = useState<number | null>(null)

  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasComplete = useRef(false)
  const clockModeRef = useRef<string>('ACTIVE')
  const clockStateRef = useRef<string>('IDLE')
  const attemptChangeRef = useRef<boolean>(false)

  // Sync refs and handle vote-reveal transitions when meaningful backend state changes.
  // Deliberately excludes clock.remaining from deps so routine backend updates (vote
  // events, etc.) do not cancel the reveal timer between the 3rd vote and the 1-second
  // reveal delay. The clock tick effect below owns localRemaining updates.
  useEffect(() => {
    if (!backendState) return

    clockModeRef.current = backendState.clock.mode
    clockStateRef.current = backendState.clock.state
    attemptChangeRef.current = backendState.attemptChangeActive

    const isComplete = backendState.hasCompleteVoteSet

    if (isComplete && !wasComplete.current) {
      // All three referees just voted → reveal after 1 s; backend auto-resets at 7 s
      revealTimer.current = setTimeout(() => setRevealed(true), 1000)
    } else if (!isComplete && wasComplete.current) {
      // Votes were cleared (manual reset or backend auto-reset)
      clearTimeout(revealTimer.current ?? undefined)
      setRevealed(false)
    }

    wasComplete.current = isComplete

    return () => { clearTimeout(revealTimer.current ?? undefined) }
  }, [
    backendState?.hasCompleteVoteSet,
    backendState?.clock.mode,
    backendState?.clock.state,
    backendState?.attemptChangeActive,
    platformId,
  ])

  // Smooth local tick — anchored to wall-clock time so the display stays accurate
  // even when the tab is in the background (browsers throttle setInterval there).
  // Re-anchors on every backend update so it self-corrects after tab focus is restored.
  useEffect(() => {
    if (backendState?.clock.state !== 'RUNNING') {
      setLocalRemaining(null)
      return
    }
    const anchorMs = Date.now()
    const anchorRemaining = backendState.clock.remaining
    const id = setInterval(() => {
      const elapsedSec = (Date.now() - anchorMs) / 1000
      setLocalRemaining(Math.max(0, anchorRemaining - elapsedSec))
    }, 100)
    return () => clearInterval(id)
  }, [backendState?.clock.state, backendState?.clock.remaining])

  // Keyboard handler — actions go to the backend API
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!inputEnabled) return

      if (e.key === 'Enter') {
        if (clockModeRef.current === 'BREAK') return
        if (attemptChangeRef.current) return
        platformAction(`/platforms/${platformId}/clock`, { remoteId: 'kb-chief' })
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        if (clockModeRef.current === 'BREAK') return
        if (attemptChangeRef.current) return
        platformAction(`/platforms/${platformId}/reset`)
        return
      }

      const mapping = KEY_MAP[e.key.toLowerCase()]
      if (!mapping) return
      if (clockModeRef.current === 'BREAK' || clockStateRef.current === 'IDLE' || attemptChangeRef.current) return
      const [role, button] = mapping
      platformAction(`/platforms/${platformId}/vote`, { remoteId: `kb-${role}`, button })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [inputEnabled, platformId])

  // ── Derive typed state from backend ──────────────────────────────────────
  const votes: Record<Role, VoteButton | null> = backendState
    ? {
        left:  (backendState.votes['left']  as VoteButton | null) ?? null,
        chief: (backendState.votes['chief'] as VoteButton | null) ?? null,
        right: (backendState.votes['right'] as VoteButton | null) ?? null,
      }
    : INITIAL_VOTES

  const remaining = localRemaining ?? backendState?.clock.remaining ?? 0

  const clock: ClockSnapshot = backendState
    ? {
        mode: backendState.clock.mode,
        state: backendState.clock.state,
        remaining,
        openingAttemptsOpen: backendState.clock.mode === 'BREAK'
          ? remaining > OPENER_LOCK_CUTOFF
          : false,
        openingAttemptsRemaining: backendState.clock.mode === 'BREAK'
          ? Math.max(0, remaining - OPENER_LOCK_CUTOFF)
          : null,
      }
    : INITIAL_CLOCK

  const attemptChangeActive = backendState?.attemptChangeActive ?? false

  function startBreakCountdown(minutes: 10 | 20) {
    platformAction(`/platforms/${platformId}/break`, { durationSeconds: minutes * 60 })
  }

  function toggleAttemptChange() {
    platformAction(`/platforms/${platformId}/attempt-change`)
  }

  return {
    config: { platformName, dayStr, configFound },
    votes,
    revealed,
    clock,
    connected,
    attemptChangeActive,
    startBreakCountdown,
    toggleAttemptChange,
  }
}
