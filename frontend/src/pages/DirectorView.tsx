import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformCard } from '@/components/PlatformCard'
import { platformAction } from '@/hooks/usePlatformSocket'
import { formatTime } from '@/lib/platformHelpers'
import { STORAGE_KEY, type StoredMeetConfig } from '@/lib/platformTypes'

type GlobalBreakMode = 'duration' | 'targetTime'

function readActivePlatformCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const config: StoredMeetConfig = JSON.parse(raw)
    return (config.days?.[0]?.platforms ?? []).filter((p) => p.active).length
  } catch {
    return 0
  }
}

function durationUntil(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  const target = new Date()
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1)
  return Math.round((target.getTime() - Date.now()) / 1000)
}

export default function DirectorView() {
  const platformCount = readActivePlatformCount()

  // ── Global break state ────────────────────────────────────────────────────
  const [breakMode, setBreakMode] = useState<GlobalBreakMode>('duration')

  // Duration mode
  const [durationMins, setDurationMins] = useState('')
  const [durationSecs, setDurationSecs] = useState('')

  // Target time mode
  const [targetTime, setTargetTime] = useState('')

  // Tick counter forces a re-render every second so the preview stays current
  const [, setTick] = useState(0)
  useEffect(() => {
    if (breakMode !== 'targetTime' || !targetTime) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [breakMode, targetTime])

  // Computed inline on every render so no stale state
  const targetPreview =
    breakMode === 'targetTime' && targetTime ? durationUntil(targetTime) : null

  function computedDuration(): number | null {
    if (breakMode === 'duration') {
      const mins = parseInt(durationMins || '0', 10)
      const secs = parseInt(durationSecs || '0', 10)
      const total = mins * 60 + secs
      return total > 0 ? total : null
    }
    if (breakMode === 'targetTime' && targetTime) {
      const secs = durationUntil(targetTime)
      return secs > 0 ? secs : null
    }
    return null
  }

  const duration = computedDuration()
  const buttonLabel =
    duration !== null
      ? `Start Global Break — ${formatTime(duration)}`
      : breakMode === 'targetTime' && targetTime && (targetPreview ?? 0) <= 0
        ? 'Time has already passed'
        : 'Start Global Break'

  function startGlobalBreak() {
    if (duration === null) return
    platformAction('/platforms/break', { durationSeconds: duration })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-primary">Meet Director</h1>

      {/* ── Global Break ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Global Break</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            {(['duration', 'targetTime'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setBreakMode(m)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  breakMode === m
                    ? 'bg-accent text-accent-text'
                    : 'bg-background border border-border text-secondary hover:text-primary hover:border-accent'
                }`}
              >
                {m === 'duration' ? 'Duration' : 'Target Time'}
              </button>
            ))}
          </div>

          {/* Duration inputs */}
          {breakMode === 'duration' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={durationMins}
                  onChange={(e) => setDurationMins(e.target.value)}
                  className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-primary text-right focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-sm text-secondary">min</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="0"
                  value={durationSecs}
                  onChange={(e) => setDurationSecs(e.target.value)}
                  className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-primary text-right focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-sm text-secondary">sec</span>
              </div>
            </div>
          )}

          {/* Target time input */}
          {breakMode === 'targetTime' && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">Start at</span>
                <input
                  type="time"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              {targetPreview !== null && (
                <span className="text-sm text-secondary">
                  {targetPreview > 0
                    ? `in ${formatTime(targetPreview)}`
                    : 'Time has already passed'}
                </span>
              )}
            </div>
          )}

          {/* Start button */}
          <button
            onClick={startGlobalBreak}
            disabled={duration === null}
            className={`self-start px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              duration !== null
                ? 'bg-accent text-accent-text hover:bg-accent-hover'
                : 'bg-surface border border-border text-secondary cursor-not-allowed'
            }`}
          >
            {buttonLabel}
          </button>
        </CardContent>
      </Card>

      {/* ── Platform grid ────────────────────────────────────────────────── */}
      {platformCount === 0 ? (
        <p className="text-secondary text-sm">
          No platforms configured. Set them up in Meet Setup first.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: platformCount }, (_, i) => (
            <PlatformCard key={i + 1} numericId={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
