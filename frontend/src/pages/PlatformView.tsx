import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Types (subset of MeetConfig — source of truth is MeetSetup.tsx)
// ---------------------------------------------------------------------------

interface StoredPlatform {
  name: string
  active: boolean
}

interface StoredMeetConfig {
  startDate: string
  days: Array<{ platforms: StoredPlatform[] }>
}

type VoteButton = 'white' | 'red' | 'blue' | 'yellow'
type Role = 'left' | 'chief' | 'right'

type ClockMode = 'ACTIVE' | 'BREAK'
type ClockState = 'IDLE' | 'RUNNING' | 'EXPIRED'

interface ClockSnapshot {
  mode: ClockMode
  state: ClockState
  remaining: number
  openingAttemptsOpen: boolean
  openingAttemptsRemaining: number | null
}

const ACTIVE_DURATION = 60

const INITIAL_CLOCK: ClockSnapshot = {
  mode: 'ACTIVE',
  state: 'IDLE',
  remaining: ACTIVE_DURATION,
  openingAttemptsOpen: false,
  openingAttemptsRemaining: null,
}

const INITIAL_VOTES: Record<Role, VoteButton | null> = {
  left: null,
  chief: null,
  right: null,
}

const STORAGE_KEY = 'platformready_meet'

// Key map: key → [role, button]
const KEY_MAP: Record<string, [Role, VoteButton]> = {
  q: ['left', 'white'],  w: ['left', 'red'],   e: ['left', 'blue'],   r: ['left', 'yellow'],
  a: ['chief', 'white'], s: ['chief', 'red'],  d: ['chief', 'blue'],  f: ['chief', 'yellow'],
  z: ['right', 'white'], x: ['right', 'red'],  c: ['right', 'blue'],  v: ['right', 'yellow'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function dayLabel(startDate: string, index: number): string {
  if (!startDate) return `Day ${index + 1}`
  const date = new Date(startDate)
  date.setDate(date.getDate() + index)
  return `Day ${index + 1} — ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

// ---------------------------------------------------------------------------
// RefereeLight component
// ---------------------------------------------------------------------------

function RefereeLight({ label, vote, revealed }: { label: string; vote: VoteButton | null; revealed: boolean }) {
  const voted = vote !== null
  const CIRCLE = 'w-44 h-44 rounded-full'

  const stripClass =
    revealed && vote === 'blue' ? 'bg-blue-600' :
    revealed && vote === 'yellow' ? 'bg-yellow-400' :
    null

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        {/* Circle: invisible → gray ring → colored */}
        {!voted ? (
          <div className={CIRCLE} />
        ) : !revealed ? (
          <div className={`${CIRCLE} border-4 border-secondary`} />
        ) : vote === 'white' ? (
          <div className={`${CIRCLE} bg-white`} />
        ) : (
          <div className={`${CIRCLE} bg-red-600`} />
        )}

        {/* Secondary color strip for blue / yellow cards; spacer when absent */}
        {stripClass
          ? <div className={`w-44 h-5 rounded-sm ${stripClass}`} />
          : <div className="w-44 h-5" />
        }
      </div>

      <span className="text-base font-semibold tracking-widest text-secondary uppercase">
        {label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PlatformView() {
  const { id } = useParams<{ id: string }>()
  const platformIndex = Number(id) - 1

  // ── Config from localStorage ─────────────────────────────────────────────
  let platformName: string | null = null
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
        return { ...prev, remaining: next, state: next <= 0 ? 'EXPIRED' : 'RUNNING' }
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
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Enter: toggle clock (mirrors backend handleChiefClockPress)
      if (e.key === 'Enter') {
        setClock((prev) => {
          if (prev.state === 'RUNNING') {
            return { ...prev, state: 'IDLE', remaining: ACTIVE_DURATION }
          }
          return { ...prev, state: 'RUNNING', remaining: ACTIVE_DURATION }
        })
        return
      }

      // Space: reset votes
      if (e.key === ' ') {
        e.preventDefault()
        resetVotes()
        return
      }

      // Referee vote keys
      const mapping = KEY_MAP[e.key.toLowerCase()]
      if (!mapping) return
      const [role, button] = mapping

      setVotes((prev) => {
        if (prev[role] !== null) return prev  // role already voted, ignore
        const next = { ...prev, [role]: button }

        // All three voted → schedule reveal after 1s, then auto-reset after 5s
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
  }, [])

  // ── Early return for unconfigured platform ────────────────────────────────
  if (!configFound) {
    return (
      <div className="platform-display min-h-screen bg-background flex items-center justify-center">
        <p className="text-secondary text-lg">Platform {id} is not configured.</p>
      </div>
    )
  }

  // ── Clock display ─────────────────────────────────────────────────────────
  const clockColorClass =
    clock.state === 'EXPIRED' ? 'text-red-500' :
    clock.remaining <= 30    ? 'text-yellow-400' :
    'text-primary'

  return (
    <div className="platform-display min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-border">
        <span className="text-xl font-semibold text-primary tracking-wide">{platformName}</span>
        <span className="text-sm text-secondary">{dayStr}</span>
      </header>

      {/* Main display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-20">
        {/* Referee lights: Left — Chief — Right */}
        <div className="flex items-start gap-24">
          <RefereeLight label="Left"  vote={votes.left}  revealed={revealed} />
          <RefereeLight label="Chief" vote={votes.chief} revealed={revealed} />
          <RefereeLight label="Right" vote={votes.right} revealed={revealed} />
        </div>

        {/* Clock */}
        <div className="flex flex-col items-center gap-3">
          <span className={`text-9xl font-mono font-bold tabular-nums ${clockColorClass}`}>
            {formatTime(clock.remaining)}
          </span>

          {clock.mode === 'BREAK' && clock.openingAttemptsOpen && clock.openingAttemptsRemaining !== null && (
            <div className="flex flex-col items-center gap-1 mt-6">
              <span className="text-4xl font-mono font-bold tabular-nums text-red-500">
                {formatTime(clock.openingAttemptsRemaining)}
              </span>
              <span className="text-sm text-secondary uppercase tracking-widest">
                Time to change openers
              </span>
            </div>
          )}

          {clock.mode === 'BREAK' && !clock.openingAttemptsOpen && (
            <span className="text-sm text-secondary uppercase tracking-widest mt-2">
              Openers locked
            </span>
          )}
        </div>
      </div>

      {/* Keyboard hint overlay */}
      <div className="fixed bottom-4 right-4 bg-surface/80 border border-border rounded-lg px-4 py-3 text-xs text-secondary leading-relaxed">
        <div>Q/A/Z = White &nbsp; W/S/X = Red &nbsp; E/D/C = Blue &nbsp; R/F/V = Yellow</div>
        <div className="mt-1">[Enter] Clock &nbsp; [Space] Reset votes</div>
      </div>
    </div>
  )
}
