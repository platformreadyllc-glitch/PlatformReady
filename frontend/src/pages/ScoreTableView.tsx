import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RefereeLight } from '@/components/RefereeLight'
import { formatTime, dayLabel } from '@/lib/platformHelpers'
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

type ControlStep = 'select' | 'confirm' | 'start'

export default function ScoreTableView() {
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

  // ── Controls panel state ──────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<10 | 20 | null>(null)
  const [controlStep, setControlStep] = useState<ControlStep>('select')

  function openPanel() {
    setSelectedMinutes(null)
    setControlStep('select')
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setSelectedMinutes(null)
    setControlStep('select')
  }

  function selectDuration(minutes: 10 | 20) {
    setSelectedMinutes(minutes)
    setControlStep('confirm')
  }

  function confirmDuration() {
    setControlStep('start')
  }

  function startCountdown() {
    if (selectedMinutes === null) return
    const duration = selectedMinutes * 60
    setClock({
      mode: 'BREAK',
      state: 'RUNNING',
      remaining: duration,
      openingAttemptsOpen: duration > OPENER_LOCK_CUTOFF,
      openingAttemptsRemaining: Math.max(0, duration - OPENER_LOCK_CUTOFF),
    })
    closePanel()
  }

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

  // Keyboard handler — votes, clock toggle, reset (disabled while panel is open)
  useEffect(() => {
    function resetVotes() {
      clearTimeout(revealTimer.current ?? undefined)
      clearTimeout(resetTimer.current ?? undefined)
      setRevealed(false)
      setVotes(INITIAL_VOTES)
      setClock(INITIAL_CLOCK)
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (panelOpen) return

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
  }, [panelOpen])

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
        <span className="text-[2vw] font-semibold text-primary tracking-wide">{platformName}</span>
        <span className="text-[1.2vw] text-secondary">{dayStr}</span>
      </header>

      {/* Main display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-[6vh]">
        {/* Referee lights: Left — Chief — Right */}
        <div className="flex items-start gap-[5vw]">
          <RefereeLight vote={votes.left}  revealed={revealed} />
          <RefereeLight vote={votes.chief} revealed={revealed} />
          <RefereeLight vote={votes.right} revealed={revealed} />
        </div>

        {/* Clock */}
        <div className="flex flex-col items-center gap-3">
          <span className={`text-[20vw] [font-family:'DSEG7ClassicBold',monospace] font-bold tabular-nums ${clockColorClass}`}>
            {formatTime(clock.remaining)}
          </span>

          {clock.mode === 'BREAK' && clock.openingAttemptsOpen && clock.openingAttemptsRemaining !== null && (
            <div className="flex flex-col items-center gap-1 mt-6">
              <span className="text-4xl [font-family:'Inter',sans-serif] font-bold tabular-nums text-red-500">
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

      {/* Controls — fixed bottom-center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        {panelOpen && (
          <div className="bg-surface border border-border rounded-xl px-6 py-5 flex flex-col gap-4 min-w-[360px] shadow-lg">
            {/* Duration selection */}
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-secondary">Select break duration</span>
              <div className="flex gap-3">
                {([10, 20] as const).map((mins) => (
                  <button
                    key={mins}
                    onClick={() => selectDuration(mins)}
                    className={`flex-1 py-3 rounded-lg text-lg font-bold font-mono transition-colors ${
                      selectedMinutes === mins
                        ? 'bg-accent text-accent-text'
                        : 'bg-background border border-border text-primary hover:border-accent'
                    }`}
                  >
                    {mins}:00
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm step */}
            {controlStep !== 'select' && (
              <button
                onClick={confirmDuration}
                disabled={controlStep === 'start'}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  controlStep === 'start'
                    ? 'bg-surface border border-border text-secondary cursor-default'
                    : 'bg-surface border border-accent text-accent hover:bg-accent hover:text-accent-text'
                }`}
              >
                Confirm {selectedMinutes}:00
              </button>
            )}

            {/* Start step */}
            {controlStep === 'start' && (
              <button
                onClick={startCountdown}
                className="w-full py-3 rounded-lg font-semibold bg-accent text-accent-text hover:bg-accent-hover transition-colors"
              >
                Start Countdown
              </button>
            )}

            <button
              onClick={closePanel}
              className="text-xs text-secondary hover:text-primary transition-colors text-center"
            >
              Cancel
            </button>
          </div>
        )}

        <button
          onClick={panelOpen ? closePanel : openPanel}
          className="px-5 py-2 rounded-lg text-sm font-medium bg-surface border border-border text-secondary hover:text-primary hover:border-accent transition-colors"
        >
          Controls
        </button>
      </div>

      {/* Keyboard hint overlay */}
      <div className="fixed bottom-4 right-4 bg-surface/80 border border-border rounded-lg px-4 py-3 text-xs text-secondary leading-relaxed">
        <div>Q/A/Z = White &nbsp; W/S/X = Red &nbsp; E/D/C = Blue &nbsp; R/F/V = Yellow</div>
        <div className="mt-1">[Enter] Clock &nbsp; [Space] Reset votes</div>
      </div>
    </div>
  )
}
