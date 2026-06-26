import { useState } from 'react'
import { RefereeLight } from '@/components/RefereeLight'
import { formatTime } from '@/lib/platformHelpers'
import { usePlatformState } from '@/hooks/usePlatformState'

type BreakStep = 'select' | 'confirm' | 'start'

export function PlatformCard({ numericId }: { numericId: number }) {
  const id = String(numericId)

  const [breakPanelOpen, setBreakPanelOpen] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<10 | 20 | null>(null)
  const [breakStep, setBreakStep] = useState<BreakStep>('select')
  const [acPanelOpen, setAcPanelOpen] = useState(false)

  const anyPanelOpen = breakPanelOpen || acPanelOpen
  const {
    config,
    votes,
    revealed,
    clock,
    connected,
    attemptChangeActive,
    startBreakCountdown,
    toggleAttemptChange,
  } = usePlatformState(id, !anyPanelOpen)

  function openBreakPanel() {
    setSelectedMinutes(null)
    setBreakStep('select')
    setAcPanelOpen(false)
    setBreakPanelOpen(true)
  }

  function closeBreakPanel() {
    setBreakPanelOpen(false)
    setSelectedMinutes(null)
    setBreakStep('select')
  }

  function selectDuration(minutes: 10 | 20) {
    setSelectedMinutes(minutes)
    setBreakStep('confirm')
  }

  function startCountdown() {
    if (selectedMinutes === null) return
    startBreakCountdown(selectedMinutes)
    closeBreakPanel()
  }

  function handleToggleAttemptChange() {
    toggleAttemptChange()
    setAcPanelOpen(false)
  }

  if (!config.configFound) return null

  const clockColor =
    clock.state === 'EXPIRED'
      ? 'text-red-500'
      : clock.remaining <= 30
        ? 'text-yellow-400'
        : 'text-primary'

  const statusLabel =
    clock.mode === 'BREAK'
      ? `BREAK · ${clock.state}`
      : `ACTIVE · ${clock.state}`

  return (
    <div className="bg-surface border border-border rounded-xl flex flex-col overflow-hidden shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-primary">{config.platformName}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">{config.dayStr}</span>
          <span
            className={`w-2 h-2 rounded-full ${connected === false ? 'bg-red-500' : connected === true ? 'bg-green-500' : 'bg-secondary'}`}
            title={connected === false ? 'Disconnected' : connected === true ? 'Connected' : 'Connecting…'}
          />
        </div>
      </div>

      {/* Display area */}
      <div className="flex flex-col items-center justify-center gap-3 py-6 px-4">
        {clock.mode === 'ACTIVE' && (
          <div className="flex items-center gap-4">
            <RefereeLight vote={votes.left} revealed={revealed} compact />
            <RefereeLight vote={votes.chief} revealed={revealed} compact />
            <RefereeLight vote={votes.right} revealed={revealed} compact />
          </div>
        )}

        {clock.mode === 'BREAK' && (
          <span className="text-xs font-semibold uppercase tracking-widest text-secondary">
            Flight A Begins
          </span>
        )}

        <span
          className={`text-4xl [font-family:'DSEG7ClassicBold',monospace] font-bold tabular-nums ${clockColor}`}
        >
          {formatTime(clock.remaining)}
        </span>

        <span className="text-xs text-secondary">{statusLabel}</span>
      </div>

      {/* Break panel */}
      {breakPanelOpen && (
        <div className="mx-4 mb-3 bg-background border border-border rounded-lg px-4 py-3 flex flex-col gap-3">
          <span className="text-xs uppercase tracking-widest text-secondary">
            Select break duration
          </span>
          <div className="flex gap-2">
            {([10, 20] as const).map((mins) => (
              <button
                key={mins}
                onClick={() => selectDuration(mins)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold font-mono transition-colors ${
                  selectedMinutes === mins
                    ? 'bg-accent text-accent-text'
                    : 'bg-surface border border-border text-primary hover:border-accent'
                }`}
              >
                {mins}:00
              </button>
            ))}
          </div>

          {breakStep !== 'select' && (
            <button
              onClick={() => setBreakStep('start')}
              disabled={breakStep === 'start'}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                breakStep === 'start'
                  ? 'bg-surface border border-border text-secondary cursor-default'
                  : 'bg-surface border border-accent text-accent hover:bg-accent hover:text-accent-text'
              }`}
            >
              Confirm {selectedMinutes}:00
            </button>
          )}

          {breakStep === 'start' && (
            <button
              onClick={startCountdown}
              className="w-full py-2 rounded-lg text-sm font-semibold bg-accent text-accent-text hover:bg-accent-hover transition-colors"
            >
              Start Countdown
            </button>
          )}

          <button
            onClick={closeBreakPanel}
            className="text-xs text-secondary hover:text-primary transition-colors text-center"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Attempt change panel */}
      {acPanelOpen && (
        <div className="mx-4 mb-3 bg-background border border-border rounded-lg px-4 py-3 flex flex-col gap-3">
          <span className="text-xs uppercase tracking-widest text-secondary text-center">
            Attempt Change Alert
          </span>
          <button
            onClick={handleToggleAttemptChange}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
              attemptChangeActive
                ? 'bg-surface border border-border text-primary hover:border-accent hover:text-accent'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {attemptChangeActive ? 'Stop Alert' : 'Activate Alert'}
          </button>
          <button
            onClick={() => setAcPanelOpen(false)}
            className="text-xs text-secondary hover:text-primary transition-colors text-center"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex gap-2 px-4 pb-4">
        <button
          onClick={breakPanelOpen ? closeBreakPanel : openBreakPanel}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-background border border-border text-secondary hover:text-primary hover:border-accent transition-colors"
        >
          Break Clock
        </button>
        <button
          onClick={() => {
            setBreakPanelOpen(false)
            setAcPanelOpen((o) => !o)
          }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
            attemptChangeActive
              ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
              : 'bg-background border-border text-secondary hover:text-primary hover:border-amber-500'
          }`}
        >
          Attempt Change
        </button>
      </div>
    </div>
  )
}
