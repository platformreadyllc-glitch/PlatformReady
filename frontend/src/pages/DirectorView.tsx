import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlatformCard } from '@/components/PlatformCard'
import { API, platformAction } from '@/hooks/usePlatformSocket'
import { dayLabel, formatTime, readActiveDayState, writeActiveDayState } from '@/lib/platformHelpers'
import { STORAGE_KEY, type StoredMeetConfig } from '@/lib/platformTypes'

// ---------------------------------------------------------------------------
// Local types for the full meet config (superset of StoredMeetConfig)
// ---------------------------------------------------------------------------

interface FullDayConfig {
  liftingCastMeetId: string
  liftingCastPassword: string
  platforms: Array<{ name: string; active: boolean; liftingCastPlatformId: string }>
}

interface FullMeetConfig {
  startDate: string
  numDays: number
  liftingCastPassword: string
  perDayPasswords: boolean
  days: FullDayConfig[]
}

interface PlatformConnectResult {
  name: string
  status: 'loading' | 'success' | 'error'
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readActivePlatformCount(dayIndex: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const config: StoredMeetConfig = JSON.parse(raw)
    return (config.days?.[dayIndex]?.platforms ?? []).filter((p) => p.active).length
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DirectorView() {
  // ── Day Control state ───────────────────────────────────────────────────
  const [activeDayIndex, setActiveDayIndex] = useState(() => readActiveDayState().index)
  const [completedDayIndices, setCompletedDayIndices] = useState(
    () => readActiveDayState().completedIndices,
  )
  const [meetConfig, setMeetConfig] = useState<FullMeetConfig | null>(null)
  const [dayControlOpen, setDayControlOpen] = useState(false)
  const [startingDay, setStartingDay] = useState<number | null>(null)
  const [startDayResults, setStartDayResults] = useState<PlatformConnectResult[] | null>(null)

  // ── Global Break state ──────────────────────────────────────────────────
  const [breakCollapsed, setBreakCollapsed] = useState(true)
  const [targetTime, setTargetTime] = useState('')
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null)

  // Wall-clock timestamp updated every second
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Load full meet config from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setMeetConfig(JSON.parse(raw) as FullMeetConfig)
    } catch {}
  }, [])

  // Restore break indicator after a page refresh
  useEffect(() => {
    fetch(`${API}/platforms/break`)
      .then((r) => (r.ok ? (r.json() as Promise<{ endsAt: number } | null>) : null))
      .then((data) => { if (data?.endsAt) setBreakEndsAt(data.endsAt) })
      .catch(() => {})
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────
  const platformCount = readActivePlatformCount(activeDayIndex)
  const isMultiDay = (meetConfig?.numDays ?? 1) > 1
  const globalBreakActive = breakEndsAt !== null && now < breakEndsAt
  const targetPreview = targetTime ? durationUntil(targetTime, now) : null
  const duration = targetPreview !== null && targetPreview > 0 ? targetPreview : null

  const buttonLabel =
    duration !== null
      ? `Start Global Break — ${formatTime(duration)}`
      : targetTime && targetPreview !== null && targetPreview <= 0
        ? 'Time has already passed'
        : 'Start Global Break'

  // ── Global Break handlers ───────────────────────────────────────────────
  function startGlobalBreak() {
    if (duration === null) return
    platformAction('/platforms/break', { durationSeconds: duration })
    setBreakEndsAt(now + duration * 1000)
  }

  function cancelGlobalBreak() {
    platformAction('/platforms/break', undefined, 'DELETE')
    setBreakEndsAt(null)
  }

  // ── Day Control handlers ────────────────────────────────────────────────
  async function handleStartDay(di: number) {
    if (!meetConfig) return
    const day = meetConfig.days[di]
    if (!day) return

    const activeLcPlatforms = day.platforms
      .map((p, pi) => ({ ...p, pi }))
      .filter((p) => p.active && day.liftingCastMeetId && p.liftingCastPlatformId)

    if (activeLcPlatforms.length === 0) {
      // No LC platforms configured — just switch the day
      const newState = { index: di, completedIndices }
      writeActiveDayState(newState)
      setActiveDayIndex(di)
      return
    }

    setStartingDay(di)
    setStartDayResults(
      activeLcPlatforms.map((p) => ({
        name: p.name || `Platform ${p.pi + 1}`,
        status: 'loading' as const,
      })),
    )

    const effectivePassword =
      meetConfig.perDayPasswords || meetConfig.numDays === 1
        ? day.liftingCastPassword
        : meetConfig.liftingCastPassword

    const results = await Promise.allSettled(
      activeLcPlatforms.map(async ({ pi, liftingCastPlatformId }) => {
        const testRes = await fetch(`${API}/liftingcast/test-connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetId: day.liftingCastMeetId,
            platformId: liftingCastPlatformId,
            password: effectivePassword,
          }),
        })
        if (!testRes.ok) throw new Error(`Server error ${testRes.status}`)
        const testData = (await testRes.json()) as { success: boolean; error?: string }
        if (!testData.success) throw new Error(testData.error ?? 'Connection failed')

        await fetch(`${API}/liftingcast/session/platform-${pi + 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetId: day.liftingCastMeetId,
            lcPlatformId: liftingCastPlatformId,
            password: effectivePassword,
          }),
        })
      }),
    )

    setStartDayResults(
      activeLcPlatforms.map((p, i) => {
        const r = results[i]
        return {
          name: p.name || `Platform ${p.pi + 1}`,
          status: r.status === 'fulfilled' ? ('success' as const) : ('error' as const),
          error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
        }
      }),
    )

    if (results.some((r) => r.status === 'fulfilled')) {
      const newState = { index: di, completedIndices }
      writeActiveDayState(newState)
      setActiveDayIndex(di)
    }

    setStartingDay(null)
  }

  function handleMarkComplete(di: number) {
    if (completedDayIndices.includes(di)) return
    const newCompleted = [...completedDayIndices, di]
    writeActiveDayState({ index: activeDayIndex, completedIndices: newCompleted })
    setCompletedDayIndices(newCompleted)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-primary">Meet Director</h1>

      {/* ── Day Control ──────────────────────────────────────────────────── */}
      {isMultiDay && meetConfig && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none p-4"
            onClick={() => setDayControlOpen((c) => !c)}
          >
            <div className="flex items-center justify-between">
              <CardTitle>Day Control</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-xs text-secondary">
                  {dayLabel(meetConfig.startDate, activeDayIndex)}
                </span>
                {dayControlOpen
                  ? <ChevronUp size={16} className="text-secondary" />
                  : <ChevronDown size={16} className="text-secondary" />}
              </div>
            </div>
          </CardHeader>

          {dayControlOpen && (
            <CardContent className="flex flex-col gap-0 px-4 pb-4 pt-0">
              {Array.from({ length: meetConfig.numDays }, (_, di) => {
                const isActive = di === activeDayIndex
                const isCompleted = completedDayIndices.includes(di)
                const isStarting = startingDay === di

                return (
                  <div
                    key={di}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-primary">
                        {dayLabel(meetConfig.startDate, di)}
                      </span>
                      {isCompleted ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-secondary border border-border">
                          Completed
                        </span>
                      ) : isActive ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/30">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-secondary border border-border">
                          Upcoming
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isActive && !isCompleted && (
                        <button
                          onClick={() => handleMarkComplete(di)}
                          className="px-3 py-1 rounded text-xs font-medium border border-border text-secondary hover:text-primary transition-colors"
                        >
                          Mark Complete
                        </button>
                      )}
                      {!isActive && (
                        <button
                          onClick={() => handleStartDay(di)}
                          disabled={startingDay !== null}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            isStarting || startingDay !== null
                              ? 'bg-surface border border-border text-secondary cursor-not-allowed'
                              : 'bg-accent text-accent-text hover:bg-accent-hover'
                          }`}
                        >
                          {isStarting ? 'Starting…' : di < activeDayIndex ? 'Restart' : 'Start Day'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Platform connection results */}
              {startDayResults && (
                <div className="flex flex-col gap-1.5 pt-3">
                  <p className="text-xs font-medium text-secondary uppercase tracking-wide">
                    Connection status
                  </p>
                  {startDayResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {r.status === 'loading' && (
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                      )}
                      {r.status === 'success' && (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      )}
                      {r.status === 'error' && (
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      )}
                      <span className="text-xs text-primary">{r.name}</span>
                      {r.error && (
                        <span className="text-xs text-red-500">— {r.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Global Break ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none p-4"
          onClick={() => setBreakCollapsed((c) => !c)}
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
              {breakCollapsed
                ? <ChevronDown size={16} className="text-secondary" />
                : <ChevronUp size={16} className="text-secondary" />}
            </div>
          </div>
        </CardHeader>

        {!breakCollapsed && (
          <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
            {globalBreakActive && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-sm font-medium text-accent">Global break in progress</span>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-secondary">Start Flight A at:</span>
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
              {globalBreakActive ? (
                <button
                  onClick={cancelGlobalBreak}
                  className="px-5 py-1.5 rounded-lg text-sm font-semibold border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Cancel Global Break
                </button>
              ) : (
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
              )}
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
