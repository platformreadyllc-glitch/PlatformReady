import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface PlatformConfig {
  name: string
  sessionCount: number
  liftingCastPlatformId: string
  active: boolean
}

interface DayConfig {
  liftingCastMeetId: string
  platforms: PlatformConfig[]
}

interface MeetConfig {
  name: string
  startDate: string
  numDays: number
  numPlatforms: number
  liftingCastPassword: string
  days: DayConfig[]
}

const STORAGE_KEY = 'platformready_meet'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyDays(numDays: number, numPlatforms: number): DayConfig[] {
  return Array.from({ length: numDays }, () => ({
    liftingCastMeetId: '',
    platforms: Array.from({ length: numPlatforms }, () => ({
      name: '',
      sessionCount: 1,
      liftingCastPlatformId: '',
      active: true,
    })),
  }))
}

function dayLabel(startDate: string, index: number): string {
  if (!startDate) return `Day ${index + 1}`
  const date = new Date(startDate)
  date.setDate(date.getDate() + index)
  return `Day ${index + 1} — ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MeetSetup() {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [numDays, setNumDays] = useState(1)
  const [numPlatforms, setNumPlatforms] = useState(1)
  const [password, setPassword] = useState('')
  const [days, setDays] = useState<DayConfig[]>(() => buildEmptyDays(1, 1))
  const [saved, setSaved] = useState(false)

  type TestState = 'idle' | 'loading' | 'success' | 'error'
  const [testStatus, setTestStatus] = useState<Record<string, TestState>>({})
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const [platformNames, setPlatformNames] = useState<Record<string, string>>({})

  function resetAllTestStatuses() {
    setTestStatus({})
    setTestErrors({})
    setPlatformNames({})
  }

  // Load saved config from localStorage on first render
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const config: MeetConfig = JSON.parse(raw)
      setName(config.name)
      setStartDate(config.startDate)
      setNumDays(config.numDays)
      setNumPlatforms(config.numPlatforms)
      setPassword(config.liftingCastPassword)
      setDays(
        config.days.map((day) => ({
          ...day,
          platforms: day.platforms.map((p) => ({ ...p, active: p.active ?? true })),
        }))
      )
    } catch {
      // ignore malformed data
    }
  }, [])

  // Rebuild the days grid whenever numDays or numPlatforms changes.
  // Preserve existing values where possible.
  function resizeDays(nextDays: number, nextPlatforms: number) {
    setDays((prev) =>
      Array.from({ length: nextDays }, (_, di) => {
        const existingDay = prev[di]
        return {
          liftingCastMeetId: existingDay?.liftingCastMeetId ?? '',
          platforms: Array.from({ length: nextPlatforms }, (_, pi) => {
            const existingPlatform = existingDay?.platforms[pi]
            return {
              name: existingPlatform?.name ?? '',
              sessionCount: existingPlatform?.sessionCount ?? 1,
              liftingCastPlatformId: existingPlatform?.liftingCastPlatformId ?? '',
              active: existingPlatform?.active ?? true,
            }
          }),
        }
      })
    )
  }

  function handleNumDaysChange(value: number) {
    const clamped = Math.max(1, value)
    setNumDays(clamped)
    resizeDays(clamped, numPlatforms)
  }

  function handleNumPlatformsChange(value: number) {
    const clamped = Math.max(1, value)
    setNumPlatforms(clamped)
    resizeDays(numDays, clamped)
  }

  function updateDayMeetId(dayIndex: number, value: string) {
    setDays((prev) =>
      prev.map((day, i) => (i === dayIndex ? { ...day, liftingCastMeetId: value } : day))
    )
    resetAllTestStatuses()
  }

  function updatePlatform(dayIndex: number, platformIndex: number, patch: Partial<PlatformConfig>) {
    setDays((prev) =>
      prev.map((day, di) =>
        di !== dayIndex
          ? day
          : {
              ...day,
              platforms: day.platforms.map((p, pi) =>
                pi !== platformIndex ? p : { ...p, ...patch }
              ),
            }
      )
    )
    if ('liftingCastPlatformId' in patch) {
      resetAllTestStatuses()
    }
  }

  async function handleTestConnection(dayIndex: number, platformIndex: number) {
    const key = `${dayIndex}-${platformIndex}`
    const day = days[dayIndex]
    const platform = day.platforms[platformIndex]
    setTestStatus((s) => ({ ...s, [key]: 'loading' }))
    try {
      const res = await fetch('/api/liftingcast/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetId: day.liftingCastMeetId,
          platformId: platform.liftingCastPlatformId,
          password,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setPlatformNames((n) => ({ ...n, [key]: data.platformName ?? '' }))
        setTestStatus((s) => ({ ...s, [key]: 'success' }))
        setTimeout(() => setTestStatus((s) => ({ ...s, [key]: 'idle' })), 5000)
      } else {
        setTestErrors((e) => ({ ...e, [key]: data.error ?? 'Connection failed' }))
        setTestStatus((s) => ({ ...s, [key]: 'error' }))
      }
    } catch {
      setTestErrors((e) => ({ ...e, [key]: 'Network error' }))
      setTestStatus((s) => ({ ...s, [key]: 'error' }))
    }
  }

  function handleSave(e: { preventDefault(): void }) {
    e.preventDefault()
    const config: MeetConfig = {
      name,
      startDate,
      numDays,
      numPlatforms,
      liftingCastPassword: password,
      days,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-primary">Meet Setup</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Meet basics                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Meet Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meet-name">Meet name</Label>
            <Input
              id="meet-name"
              placeholder="e.g. State Championships 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start-date">Start date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="num-days">Days</Label>
              <Input
                id="num-days"
                type="number"
                min={1}
                value={numDays}
                onChange={(e) => handleNumDaysChange(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="num-platforms">Platforms</Label>
              <Input
                id="num-platforms"
                type="number"
                min={1}
                value={numPlatforms}
                onChange={(e) => handleNumPlatformsChange(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lc-password">LiftingCast password</Label>
            <p className="text-xs text-secondary">
              Publish the meet in LiftingCast first — the password is set during publishing.
            </p>
            <Input
              id="lc-password"
              type="password"
              placeholder="LiftingCast meet password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); resetAllTestStatuses() }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Platform names (consistent across all days)             */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Names</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {days[0]?.platforms.map((platform, pi) => (
            <div key={pi} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`platform-name-${pi}`}>Platform {pi + 1} name</Label>
                <Input
                  id={`platform-name-${pi}`}
                  placeholder={`e.g. Platform ${String.fromCharCode(65 + pi)}`}
                  value={platform.name}
                  onChange={(e) => {
                    const value = e.target.value
                    setDays((prev) =>
                      prev.map((day) => ({
                        ...day,
                        platforms: day.platforms.map((p, i) =>
                          i === pi ? { ...p, name: value } : p
                        ),
                      }))
                    )
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`sessions-${pi}`}>Sessions per day</Label>
                <Input
                  id={`sessions-${pi}`}
                  type="number"
                  min={1}
                  value={platform.sessionCount}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    setDays((prev) =>
                      prev.map((day) => ({
                        ...day,
                        platforms: day.platforms.map((p, i) =>
                          i === pi ? { ...p, sessionCount: value } : p
                        ),
                      }))
                    )
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Per-day LiftingCast IDs                                 */}
      {/* ------------------------------------------------------------------ */}
      {days.map((day, di) => (
        <Card key={di}>
          <CardHeader>
            <CardTitle>{dayLabel(startDate, di)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`lc-meet-id-${di}`}>LiftingCast Meet ID</Label>
              <Input
                id={`lc-meet-id-${di}`}
                placeholder="e.g. abc123def (from liftingcast.com/meets/…)"
                value={day.liftingCastMeetId}
                onChange={(e) => updateDayMeetId(di, e.target.value)}
              />
            </div>

            {day.platforms.map((platform, pi) => (
              <div key={pi} className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border bg-background accent-accent"
                    checked={platform.active}
                    onChange={(e) => updatePlatform(di, pi, { active: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-primary">
                    {platform.name || `Platform ${pi + 1}`}
                  </span>
                </label>

                {platform.active && (
                  <div className="flex flex-col gap-1.5 pl-6">
                    <Label htmlFor={`lc-platform-id-${di}-${pi}`}>
                      LiftingCast Platform ID
                    </Label>
                    <Input
                      id={`lc-platform-id-${di}-${pi}`}
                      placeholder="Paste the platform ID from LiftingCast"
                      value={platform.liftingCastPlatformId}
                      onChange={(e) => updatePlatform(di, pi, { liftingCastPlatformId: e.target.value })}
                    />
                    <div className="flex items-center gap-2 mt-0.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        disabled={
                          testStatus[`${di}-${pi}`] === 'loading' ||
                          !day.liftingCastMeetId ||
                          !platform.liftingCastPlatformId ||
                          !password
                        }
                        onClick={() => handleTestConnection(di, pi)}
                      >
                        {testStatus[`${di}-${pi}`] === 'loading' ? 'Testing…' : 'Test connection'}
                      </Button>
                      {testStatus[`${di}-${pi}`] === 'success' && (
                        <span className="text-sm text-green-500">
                          Connected — {platformNames[`${di}-${pi}`]}
                        </span>
                      )}
                      {testStatus[`${di}-${pi}`] === 'error' && (
                        <span className="text-sm text-red-500">{testErrors[`${di}-${pi}`]}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Save button                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-3">
        <Button type="submit">Save</Button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  )
}
