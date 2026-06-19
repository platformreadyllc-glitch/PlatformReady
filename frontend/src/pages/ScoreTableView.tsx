import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PlatformDisplay } from '@/components/PlatformDisplay'
import { usePlatformState } from '@/hooks/usePlatformState'

type ControlStep = 'select' | 'confirm' | 'start'

export default function ScoreTableView() {
  const { id } = useParams<{ id: string }>()

  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedMinutes, setSelectedMinutes] = useState<10 | 20 | null>(null)
  const [controlStep, setControlStep] = useState<ControlStep>('select')
  const [attemptChangePanelOpen, setAttemptChangePanelOpen] = useState(false)

  const anyPanelOpen = panelOpen || attemptChangePanelOpen
  const { config, votes, revealed, clock, attemptChangeActive, startBreakCountdown, toggleAttemptChange } =
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
        {panelOpen && (
          <div className="bg-surface border border-border rounded-xl px-6 py-5 flex flex-col gap-4 min-w-[360px] shadow-lg">
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
        {attemptChangePanelOpen && (
          <div className="bg-surface border border-border rounded-xl px-6 py-5 flex flex-col gap-4 min-w-[360px] shadow-lg">
            <span className="text-xs uppercase tracking-widest text-secondary text-center">Attempt Change Alert</span>
            <button
              onClick={handleToggleAttemptChange}
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                attemptChangeActive
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
          <button
            onClick={panelOpen ? closePanel : openPanel}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-surface border border-border text-secondary hover:text-primary hover:border-accent transition-colors"
          >
            Controls
          </button>
          <button
            onClick={() => {
              setPanelOpen(false)
              setAttemptChangePanelOpen((o) => !o)
            }}
            className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              attemptChangeActive
                ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                : 'bg-surface border-border text-secondary hover:text-primary hover:border-amber-500'
            }`}
          >
            Attempt Change
          </button>
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
