import { useEffect, useRef, useState } from 'react'
import { dayLabel } from '@/lib/platformHelpers'
import {
  ACTIVE_DURATION,
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
  connected: boolean
  startBreakCountdown: (minutes: 10 | 20) => void
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
  const [localRemaining, setLocalRemaining] = useState(ACTIVE_DURATION)

  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasComplete = useRef(false)
  const clockModeRef = useRef<string>('ACTIVE')

  // Resync clock and handle vote-reveal transitions when backend state changes
  useEffect(() => {
    if (!backendState) return

    // Keep ref in sync so the keyboard handler can read it without stale closure
    clockModeRef.current = backendState.clock.mode

    // Resync the local countdown from the authoritative backend value
    setLocalRemaining(backendState.clock.remaining)

    const isComplete = backendState.hasCompleteVoteSet

    if (isComplete && !wasComplete.current) {
      // All three referees just voted → schedule reveal then auto-reset
      revealTimer.current = setTimeout(() => {
        setRevealed(true)
        resetTimer.current = setTimeout(() => {
          platformAction(`/platforms/${platformId}/reset`)
        }, 5000)
      }, 1000)
    } else if (!isComplete && wasComplete.current) {
      // Votes were cleared → cancel pending timers and hide reveal
      clearTimeout(revealTimer.current ?? undefined)
      clearTimeout(resetTimer.current ?? undefined)
      setRevealed(false)
    }

    wasComplete.current = isComplete
  }, [backendState?.hasCompleteVoteSet, backendState?.clock.remaining])

  // Smooth local tick — runs only while backend says clock is RUNNING
  useEffect(() => {
    if (backendState?.clock.state !== 'RUNNING') return
    const interval = setInterval(() => {
      setLocalRemaining((prev) => Math.max(0, prev - 0.1))
    }, 100)
    return () => clearInterval(interval)
  }, [backendState?.clock.state])

  // Keyboard handler — actions go to the backend API
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!inputEnabled) return

      if (e.key === 'Enter') {
        platformAction(`/platforms/${platformId}/clock`, { remoteId: 'kb-chief' })
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        platformAction(`/platforms/${platformId}/reset`)
        return
      }

      const mapping = KEY_MAP[e.key.toLowerCase()]
      if (!mapping) return
      if (clockModeRef.current === 'BREAK') return
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

  const clock: ClockSnapshot = backendState
    ? {
        mode: backendState.clock.mode,
        state: backendState.clock.state,
        remaining: localRemaining,
        openingAttemptsOpen: backendState.clock.mode === 'BREAK'
          ? localRemaining > OPENER_LOCK_CUTOFF
          : false,
        openingAttemptsRemaining: backendState.clock.mode === 'BREAK'
          ? Math.max(0, localRemaining - OPENER_LOCK_CUTOFF)
          : null,
      }
    : INITIAL_CLOCK

  function startBreakCountdown(minutes: 10 | 20) {
    platformAction(`/platforms/${platformId}/break`, { durationSeconds: minutes * 60 })
  }

  return {
    config: { platformName, dayStr, configFound },
    votes,
    revealed,
    clock,
    connected,
    startBreakCountdown,
  }
}
