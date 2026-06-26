import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformCard } from '@/components/PlatformCard'
import { platformAction } from '@/hooks/usePlatformSocket'
import { formatTime } from '@/lib/platformHelpers'
import { STORAGE_KEY, type StoredMeetConfig } from '@/lib/platformTypes'

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

function durationUntil(timeStr: string, now: number): number {
  const [h, m] = timeStr.split(':').map(Number)
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  if (target.getTime() <= now) target.setDate(target.getDate() + 1)
  return Math.round((target.getTime() - now) / 1000)
}

export default function DirectorView() {
  const platformCount = readActivePlatformCount()

  const [collapsed, setCollapsed] = useState(false)
  const [targetTime, setTargetTime] = useState('')
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null)

  // Wall-clock timestamp updated every second — used for target preview and break indicator
  // (avoids calling Date.now() during render, satisfying react-hooks/purity)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const globalBreakActive = breakEndsAt !== null && now < breakEndsAt

  const targetPreview = targetTime ? durationUntil(targetTime, now) : null
  const duration = targetPreview !== null && targetPreview > 0 ? targetPreview : null

  const buttonLabel =
    duration !== null
      ? `Start Global Break — ${formatTime(duration)}`
      : targetTime && targetPreview !== null && targetPreview <= 0
        ? 'Time has already passed'
        : 'Start Global Break'

  function startGlobalBreak() {
    if (duration === null) return
    platformAction('/platforms/break', { durationSeconds: duration })
    setBreakEndsAt(now + duration * 1000)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-primary">Meet Director</h1>

      {/* ── Global Break ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none p-4"
          onClick={() => setCollapsed((c) => !c)}
        >
          <div className="flex items-center justify-between">
            <CardTitle>Global Break</CardTitle>
            <div className="flex items-center gap-3">
              {globalBreakActive && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-medium text-accent">In progress</span>
                </div>
              )}
              {collapsed ? <ChevronDown size={16} className="text-secondary" /> : <ChevronUp size={16} className="text-secondary" />}
            </div>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
            {/* Running indicator */}
            {globalBreakActive && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-sm font-medium text-accent">Global break in progress</span>
              </div>
            )}

            {/* Time input + preview + start button in one row */}
            <div className="flex items-center gap-3 flex-wrap">
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
              <button
                onClick={startGlobalBreak}
                disabled={duration === null}
                className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  duration !== null
                    ? 'bg-accent text-accent-text hover:bg-accent-hover'
                    : 'bg-surface border border-border text-secondary cursor-not-allowed'
                }`}
              >
                {buttonLabel}
              </button>
            </div>
          </CardContent>
        )}
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
