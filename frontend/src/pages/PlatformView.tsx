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

type ClockMode = 'ACTIVE' | 'BREAK'
type ClockState = 'IDLE' | 'RUNNING' | 'EXPIRED'

interface ClockSnapshot {
  mode: ClockMode
  state: ClockState
  remaining: number
  openingAttemptsOpen: boolean
  openingAttemptsRemaining: number | null
}

// ---------------------------------------------------------------------------
// Placeholder state (will be replaced with backend polling)
// ---------------------------------------------------------------------------

const PLACEHOLDER_CLOCK: ClockSnapshot = {
  mode: 'ACTIVE',
  state: 'IDLE',
  remaining: 60,
  openingAttemptsOpen: false,
  openingAttemptsRemaining: null,
}

const PLACEHOLDER_VOTES: Record<'left' | 'chief' | 'right', VoteButton | null> = {
  left: null,
  chief: null,
  right: null,
}

const PLACEHOLDER_REVEALED = false

const STORAGE_KEY = 'platformready_meet'

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

function RefereeLight({
  label,
  vote,
  revealed,
}: {
  label: string
  vote: VoteButton | null
  revealed: boolean
}) {
  const voted = vote !== null
  const CIRCLE = 'w-44 h-44 rounded-full'

  const stripClass =
    revealed && vote === 'blue'
      ? 'bg-blue-600'
      : revealed && vote === 'yellow'
      ? 'bg-yellow-400'
      : null

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

        {/* Secondary color strip for blue / yellow cards */}
        {stripClass ? (
          <div className={`w-44 h-5 rounded-sm ${stripClass}`} />
        ) : (
          /* Placeholder to keep spacing consistent when no strip */
          <div className="w-44 h-5" />
        )}
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

  if (!configFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-secondary text-lg">Platform {id} is not configured.</p>
      </div>
    )
  }

  const clock = PLACEHOLDER_CLOCK
  const votes = PLACEHOLDER_VOTES
  const revealed = PLACEHOLDER_REVEALED

  const clockColorClass =
    clock.state === 'EXPIRED'
      ? 'text-red-500'
      : clock.remaining <= 30
      ? 'text-yellow-400'
      : 'text-primary'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-border">
        <span className="text-xl font-semibold text-primary tracking-wide">{platformName}</span>
        <span className="text-sm text-secondary">{dayStr}</span>
      </header>

      {/* Main display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-20">
        {/* Referee lights: Left — Chief — Right */}
        <div className="flex items-start gap-24">
          <RefereeLight label="Left" vote={votes.left} revealed={revealed} />
          <RefereeLight label="Chief" vote={votes.chief} revealed={revealed} />
          <RefereeLight label="Right" vote={votes.right} revealed={revealed} />
        </div>

        {/* Clock */}
        <div className="flex flex-col items-center gap-3">
          <span className={`text-9xl font-mono font-bold tabular-nums ${clockColorClass}`}>
            {formatTime(clock.remaining)}
          </span>

          {/* Break mode: opener change countdown */}
          {clock.mode === 'BREAK' &&
            clock.openingAttemptsOpen &&
            clock.openingAttemptsRemaining !== null && (
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
    </div>
  )
}
