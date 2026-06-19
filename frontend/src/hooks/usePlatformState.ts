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
  startBreakCountdown: (minutes: 10 | 20) => void
}

/**
 * @param id          Platform route param (1-based string)
 * @param inputEnabled Pass false to suppress keyboard handling (e.g. while a modal is open)
 */
export function usePlatformState(id: string | undefined, inputEnabled = true): PlatformState {
  const platformIndex = Number(id) - 1

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
        platformName = platform.name || `Platform ${Number(id)}`
        dayStr = dayLabel(config.startDate, 0)
      }
    }
  } catch {
    // ignore malformed data
  }

  // ── Interactive state ─────────────────────────────────────────────────────
  const [votes, setVotes] = useState<Record<Role, VoteButton | null>>(INITIAL_VOTES)
  const [revealed, setRevealed] = useState(false)
  const [clock, setClock] = useState<ClockSnapshot>(INITIAL_CLOCK)

  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clock countdown — ticks every 100ms while RUNNING
  useEffect(() => {
    const interval = setInterval(() => {
      setClock((prev) => {
        if (prev.state !== 'RUNNING') return prev
        const next = Math.max(0, prev.remaining - 0.1)
        const inBreak = prev.mode === 'BREAK'
        return {
          ...prev,
          remaining: next,
          state: next <= 0 ? 'EXPIRED' : 'RUNNING',
          openingAttemptsOpen: inBreak ? next > OPENER_LOCK_CUTOFF : false,
          openingAttemptsRemaining: inBreak ? Math.max(0, next - OPENER_LOCK_CUTOFF) : null,
        }
      })
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Keyboard handler — votes, clock toggle, reset
  useEffect(() => {
    function resetVotes() {
      clearTimeout(revealTimer.current ?? undefined)
      clearTimeout(resetTimer.current ?? undefined)
      setRevealed(false)
      setVotes(INITIAL_VOTES)
      setClock(INITIAL_CLOCK)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!inputEnabled) return

      if (e.key === 'Enter') {
        setClock((prev) => {
          if (prev.state === 'RUNNING') {
            return { ...prev, state: 'IDLE', remaining: ACTIVE_DURATION }
          }
          return { ...prev, state: 'RUNNING', remaining: ACTIVE_DURATION }
        })
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        resetVotes()
        return
      }

      const mapping = KEY_MAP[e.key.toLowerCase()]
      if (!mapping) return
      const [role, button] = mapping

      setVotes((prev) => {
        if (prev[role] !== null) return prev
        const next = { ...prev, [role]: button }

        if (next.left !== null && next.chief !== null && next.right !== null) {
          revealTimer.current = setTimeout(() => {
            setRevealed(true)
            resetTimer.current = setTimeout(resetVotes, 5000)
          }, 1000)
        }

        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(revealTimer.current ?? undefined)
      clearTimeout(resetTimer.current ?? undefined)
    }
  }, [inputEnabled])

  function startBreakCountdown(minutes: 10 | 20) {
    const duration = minutes * 60
    setClock({
      mode: 'BREAK',
      state: 'RUNNING',
      remaining: duration,
      openingAttemptsOpen: duration > OPENER_LOCK_CUTOFF,
      openingAttemptsRemaining: Math.max(0, duration - OPENER_LOCK_CUTOFF),
    })
  }

  return {
    config: { platformName, dayStr, configFound },
    votes,
    revealed,
    clock,
    startBreakCountdown,
  }
}
