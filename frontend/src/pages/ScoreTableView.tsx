import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlatformDisplay } from '@/components/PlatformDisplay'
import { KeyboardHintOverlay } from '@/components/KeyboardHintOverlay'
import { usePlatformState } from '@/hooks/usePlatformState'
import { platformAction } from '@/hooks/usePlatformSocket'

type ControlStep = 'select' | 'confirm' | 'start'

export default function ScoreTableView() {
  const { id } = useParams<{ id: string }>()

  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<10 | 20 | null>(null)
  const [controlStep, setControlStep] = useState<ControlStep>('select')
  const [attemptChangePanelOpen, setAttemptChangePanelOpen] = useState(false)

  const anyPanelOpen = panelOpen || attemptChangePanelOpen
  const { config, votes, revealed, clock, connected, attemptChangeActive, startBreakCountdown, toggleAttemptChange } =
    usePlatformState(id, !anyPanelOpen)

  function openPanel() {
    setSelectedMinutes(null)
    setControlStep('select')
    setAttemptChangePanelOpen(false)
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
    startBreakCountdown(selectedMinutes)
    closePanel()
  }

  function handleToggleAttemptChange() {
    toggleAttemptChange()
    setAttemptChangePanelOpen(false)
  }

  const inBreak = clock.mode === 'BREAK'
  // Derive panel visibility — panels collapse immediately when a break starts
  const showPanel = panelOpen && !inBreak
  const showAcPanel = attemptChangePanelOpen && !inBreak

  if (!config.configFound) {
    return (
      <div className="platform-display min-h-screen bg-background flex items-center justify-center">
        <p className="text-secondary text-lg">Platform {id} is not configured.</p>
      </div>
    )
  }

  return (
    <div className="platform-display min-h-screen bg-background flex flex-col">
      <PlatformDisplay
        platformName={config.platformName}
        dayStr={config.dayStr}
        votes={votes}
        revealed={revealed}
        clock={clock}
        attemptChangeActive={attemptChangeActive}
      />

      {/* Controls — fixed bottom-center */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">

        {/* Break countdown panel */}
        {showPanel && (
          <div className="bg-surface border border-border rounded-xl px-6 py-5 flex flex-col gap-4 min-w-[360px] shadow-lg">
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-secondary">Select break duration</span>
              <div className="flex gap-3">
                {([10, 20] as const).map((mins) => (
                  <button
                    key={mins}
                    onClick={() => selectDuration(mins)}
                    className={`flex-1 py-3 rounded-lg text-lg font-bold font-mono transition-colors ${selectedMinutes === mins
                      ? 'bg-accent text-accent-text'
                      : 'bg-background border border-border text-primary hover:border-accent'
                      }`}
                  >
                    {mins}:00
                  </button>
                ))}
              </div>
            </div>

            {controlStep !== 'select' && (
              <button
                onClick={confirmDuration}
                disabled={controlStep === 'start'}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${controlStep === 'start'
                  ? 'bg-surface border border-border text-secondary cursor-default'
                  : 'bg-surface border border-accent text-accent hover:bg-accent hover:text-accent-text'
                  }`}
              >
                Confirm {selectedMinutes}:00
              </button>
            )}

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

        {/* Attempt change panel */}
        {showAcPanel && (
          <div className="bg-surface border border-border rounded-xl px-6 py-5 flex flex-col gap-4 min-w-[360px] shadow-lg">
            <span className="text-xs uppercase tracking-widest text-secondary text-center">Attempt Change Alert</span>
            <button
              onClick={handleToggleAttemptChange}
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${attemptChangeActive
                ? 'bg-surface border border-border text-primary hover:border-accent hover:text-accent'
                : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
            >
              {attemptChangeActive ? 'Stop Alert' : 'Activate Alert'}
            </button>
            <button
              onClick={() => setAttemptChangePanelOpen(false)}
              className="text-xs text-secondary hover:text-primary transition-colors text-center"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Control buttons row */}
        <div className="flex gap-3">
          {inBreak ? (
            <button
              onClick={() => platformAction(`/platforms/platform-${id}/break`, undefined, 'DELETE')}
              className="px-5 py-2 rounded-lg text-sm font-medium border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
            >
              Cancel Break
            </button>
          ) : (
            <button
              onClick={panelOpen ? closePanel : openPanel}
              className="px-5 py-2 rounded-lg text-sm font-medium border bg-surface border-border text-secondary hover:text-primary hover:border-accent transition-colors"
            >
              Break Clock
            </button>
          )}
          <button
            disabled={inBreak}
            onClick={() => {
              setPanelOpen(false)
              setAttemptChangePanelOpen((o) => !o)
            }}
            className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              inBreak
                ? 'border-border text-secondary opacity-40 cursor-not-allowed'
                : attemptChangeActive
                  ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                  : 'bg-surface border-border text-secondary hover:text-primary hover:border-amber-500'
            }`}
          >
            DL3 Attempt Change
          </button>
        </div>
      </div>

      <KeyboardHintOverlay />

      {connected === false && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
          DISCONNECTED
        </div>
      )}
    </div>
  )
}
