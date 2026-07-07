import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LcMeet { id: string; name: string; date: string }
interface LcPlatform { id: string; name: string }

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
  liftingCastPassword: string
  platforms: PlatformConfig[]
}

interface MeetConfig {
  name: string
  startDate: string
  numDays: number
  numPlatforms: number
  liftingCastPassword: string
  perDayPasswords: boolean
  days: DayConfig[]
}

type TestState = 'idle' | 'loading' | 'success' | 'error'

const STORAGE_KEY = 'platformready_meet'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyDays(numDays: number, numPlatforms: number): DayConfig[] {
  return Array.from({ length: numDays }, () => ({
    liftingCastMeetId: '',
    liftingCastPassword: '',
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
  const [perDayPasswords, setPerDayPasswords] = useState(false)
  const [days, setDays] = useState<DayConfig[]>(() => buildEmptyDays(1, 1))
  const [saved, setSaved] = useState(false)

  const [testStatus, setTestStatus] = useState<Record<string, TestState>>({})
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const [platformNames, setPlatformNames] = useState<Record<string, string>>({})

  // Import from LiftingCast state
  const [importOpen, setImportOpen] = useState(false)
  const [importSource, setImportSource] = useState<'lc' | 'relay'>('lc')
  const [relayIp, setRelayIp] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [lcMeets, setLcMeets] = useState<LcMeet[]>([])
  const [selectedMeetIds, setSelectedMeetIds] = useState<string[]>([])
  const [lcPlatforms, setLcPlatforms] = useState<LcPlatform[]>([])
  const [loadingPlatforms, setLoadingPlatforms] = useState(false)
  const [importing, setImporting] = useState(false)

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
      setPerDayPasswords(config.perDayPasswords ?? false)
      setDays(
        config.days.map((day) => ({
          ...day,
          liftingCastPassword: day.liftingCastPassword ?? '',
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
          liftingCastPassword: existingDay?.liftingCastPassword ?? '',
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
    if (numDays === 1 && clamped > 1) {
      // single-day → multi-day: promote day 0's password to the shared field
      setPassword(days[0]?.liftingCastPassword ?? password)
    } else if (numDays > 1 && clamped === 1 && !perDayPasswords) {
      // multi-day → single-day: shrink to day 0, then inject shared password
      resizeDays(1, numPlatforms)
      setDays((prev) => [{ ...prev[0], liftingCastPassword: password }])
      setNumDays(clamped)
      resetAllTestStatuses()
      return
    }
    setNumDays(clamped)
    resizeDays(clamped, numPlatforms)
  }

  function handleNumPlatformsChange(value: number) {
    const clamped = Math.max(1, value)
    setNumPlatforms(clamped)
    resizeDays(numDays, clamped)
  }

  function handlePerDayPasswordsChange(checked: boolean) {
    if (checked) {
      setDays((prev) => prev.map((day) => ({ ...day, liftingCastPassword: password })))
    }
    setPerDayPasswords(checked)
    resetAllTestStatuses()
  }

  function updateDayMeetId(dayIndex: number, value: string) {
    setDays((prev) =>
      prev.map((day, i) => (i === dayIndex ? { ...day, liftingCastMeetId: value } : day))
    )
    resetAllTestStatuses()
  }

  function updateDayPassword(dayIndex: number, value: string) {
    setDays((prev) =>
      prev.map((day, i) => (i === dayIndex ? { ...day, liftingCastPassword: value } : day))
    )
    const clearDayKeys = <T extends Record<string, unknown>>(record: T): T => {
      const next = { ...record }
      for (let pi = 0; pi < numPlatforms; pi++) delete next[`${dayIndex}-${pi}`]
      return next
    }
    setTestStatus(clearDayKeys)
    setTestErrors(clearDayKeys)
    setPlatformNames(clearDayKeys)
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

  function updatePlatformName(platformIndex: number, value: string) {
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        platforms: day.platforms.map((p, i) => (i === platformIndex ? { ...p, name: value } : p)),
      }))
    )
  }

  function updatePlatformSessionCount(platformIndex: number, value: number) {
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        platforms: day.platforms.map((p, i) =>
          i === platformIndex ? { ...p, sessionCount: value } : p
        ),
      }))
    )
  }

  async function handleTestConnection(dayIndex: number, platformIndex: number) {
    const key = `${dayIndex}-${platformIndex}`
    const day = days[dayIndex]
    const platform = day.platforms[platformIndex]
    const effectivePassword = (numDays === 1 || perDayPasswords) ? day.liftingCastPassword : password
    setTestStatus((s) => ({ ...s, [key]: 'loading' }))
    try {
      const res = await fetch('/api/liftingcast/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetId: day.liftingCastMeetId,
          platformId: platform.liftingCastPlatformId,
          password: effectivePassword,
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      if (data.success) {
        setPlatformNames((n) => ({ ...n, [key]: data.platformName ?? '' }))
        setTestStatus((s) => ({ ...s, [key]: 'success' }))
        setTimeout(() => setTestStatus((s) => ({ ...s, [key]: 'idle' })), 5000)
        // Store credentials on the backend so votes and clock actions can be
        // forwarded to LC automatically. Fire-and-forget — UI is already confirmed.
        fetch(`/api/liftingcast/session/platform-${platformIndex + 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetId: day.liftingCastMeetId,
            lcPlatformId: platform.liftingCastPlatformId,
            password: effectivePassword,
          }),
        })
          .then((r) => {
            if (!r.ok) r.text().then((t) => console.error('[LC] storeSession failed', r.status, t))
            else console.log('[LC] session stored for platform', platformIndex + 1)
          })
          .catch((e) => console.error('[LC] storeSession network error', e))
      } else {
        setTestErrors((e) => ({ ...e, [key]: data.error ?? 'Connection failed' }))
        setTestStatus((s) => ({ ...s, [key]: 'error' }))
      }
    } catch {
      setTestErrors((e) => ({ ...e, [key]: 'Network error' }))
      setTestStatus((s) => ({ ...s, [key]: 'error' }))
    }
  }

  async function handleBrowse() {
    setBrowsing(true)
    setBrowseError(null)
    setLcMeets([])
    setSelectedMeetIds([])
    setLcPlatforms([])
    const relayUrl = importSource === 'relay' && relayIp ? `http://${relayIp}` : undefined
    const params = relayUrl ? `?relayUrl=${encodeURIComponent(relayUrl)}` : ''
    try {
      const res = await fetch(`/api/liftingcast/browse/meets${params}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const meets = (await res.json()) as LcMeet[]
      setLcMeets(meets)
      if (meets.length === 0) setBrowseError('No upcoming meets found.')
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : 'Failed to fetch meets.')
    } finally {
      setBrowsing(false)
    }
  }

  async function fetchPlatformsForMeet(meetId: string) {
    setLoadingPlatforms(true)
    setBrowseError(null)
    const relayUrl = importSource === 'relay' && relayIp ? `http://${relayIp}` : undefined
    const params = relayUrl ? `?relayUrl=${encodeURIComponent(relayUrl)}` : ''
    try {
      const res = await fetch(`/api/liftingcast/browse/meets/${meetId}/platforms${params}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setLcPlatforms((await res.json()) as LcPlatform[])
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : 'Failed to fetch platforms.')
    } finally {
      setLoadingPlatforms(false)
    }
  }

  async function handleToggleMeet(meetId: string) {
    const isSelected = selectedMeetIds.includes(meetId)
    // Build next selection, maintaining the order meets appear in lcMeets (already date-sorted)
    const nextIds = isSelected
      ? selectedMeetIds.filter((id) => id !== meetId)
      : lcMeets.filter((m) => selectedMeetIds.includes(m.id) || m.id === meetId).map((m) => m.id)
    setSelectedMeetIds(nextIds)
    // Re-fetch preview platforms only when the primary (first) selection changes
    const prevPrimary = selectedMeetIds[0]
    const nextPrimary = nextIds[0]
    if (nextPrimary !== prevPrimary) {
      setLcPlatforms([])
      if (nextPrimary) await fetchPlatformsForMeet(nextPrimary)
    }
  }

  async function handleImport() {
    if (selectedMeetIds.length === 0 || lcPlatforms.length === 0) return
    setImporting(true)
    const relayUrl = importSource === 'relay' && relayIp ? `http://${relayIp}` : undefined
    const params = relayUrl ? `?relayUrl=${encodeURIComponent(relayUrl)}` : ''
    let allPlatforms: LcPlatform[][]
    try {
      allPlatforms = await Promise.all(
        selectedMeetIds.map(async (id, i) => {
          if (i === 0) return lcPlatforms // already fetched for preview
          const res = await fetch(`/api/liftingcast/browse/meets/${id}/platforms${params}`)
          if (!res.ok) throw new Error(`Server error ${res.status}`)
          return (await res.json()) as LcPlatform[]
        })
      )
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : 'Failed to fetch platforms for all days.')
      setImporting(false)
      return
    }
    const primaryMeet = lcMeets.find((m) => m.id === selectedMeetIds[0])
    const newNumDays = selectedMeetIds.length
    const newNumPlatforms = lcPlatforms.length
    if (primaryMeet?.name) setName(primaryMeet.name)
    if (primaryMeet?.date) {
      const [month, day, year] = primaryMeet.date.split('/')
      setStartDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
    }
    setNumDays(newNumDays)
    setNumPlatforms(newNumPlatforms)
    setDays(
      selectedMeetIds.map((meetId, di) => {
        const dayPlatforms = allPlatforms[di] ?? allPlatforms[0]
        return {
          liftingCastMeetId: meetId,
          liftingCastPassword: '',
          platforms: Array.from({ length: newNumPlatforms }, (_, pi) => ({
            name: dayPlatforms[pi]?.name ?? lcPlatforms[pi]?.name ?? '',
            sessionCount: 1,
            liftingCastPlatformId: dayPlatforms[pi]?.id ?? '',
            active: true,
          })),
        }
      })
    )
    resetAllTestStatuses()
    setImporting(false)
    setImportOpen(false)
  }

  function handleSave(e: { preventDefault(): void }) {
    e.preventDefault()
    const config: MeetConfig = {
      name,
      startDate,
      numDays,
      numPlatforms,
      liftingCastPassword: password,
      perDayPasswords,
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
      {/* Import from LiftingCast                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="px-6 py-4">
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setImportOpen((o) => !o)}
          >
            {importOpen
              ? <ChevronDown className="h-4 w-4 shrink-0" />
              : <ChevronRight className="h-4 w-4 shrink-0" />}
            <CardTitle>Import from LiftingCast</CardTitle>
          </button>
        </CardHeader>

        {importOpen && (
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-source"
                  checked={importSource === 'lc'}
                  onChange={() => setImportSource('lc')}
                />
                <span className="text-sm">LiftingCast.com</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="import-source"
                  checked={importSource === 'relay'}
                  onChange={() => setImportSource('relay')}
                />
                <span className="text-sm">Relay Server</span>
              </label>
            </div>

            {importSource === 'relay' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="relay-ip">Relay server IP</Label>
                <Input
                  id="relay-ip"
                  placeholder="e.g. 192.168.0.100"
                  value={relayIp}
                  onChange={(e) => setRelayIp(e.target.value)}
                />
              </div>
            )}

            <Button
              type="button"
              variant="default"
              disabled={browsing || (importSource === 'relay' && !relayIp)}
              onClick={handleBrowse}
            >
              {browsing ? 'Fetching meets…' : 'Browse Meets'}
            </Button>

            {browseError && <p className="text-sm text-red-500">{browseError}</p>}

            {lcMeets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Select meets (one per day, ordered by date)</Label>
                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto rounded-md border border-border p-2">
                  {lcMeets.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 cursor-pointer rounded px-1 py-1 hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border bg-background accent-accent shrink-0"
                        checked={selectedMeetIds.includes(m.id)}
                        onChange={() => handleToggleMeet(m.id)}
                      />
                      <span className="text-sm">{m.name} ({m.date})</span>
                    </label>
                  ))}
                </div>
                {selectedMeetIds.length > 0 && (
                  <p className="text-xs text-secondary">
                    {selectedMeetIds.length} day{selectedMeetIds.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )}

            {loadingPlatforms && (
              <p className="text-sm text-secondary">Loading platforms…</p>
            )}

            {lcPlatforms.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-secondary">
                  {lcPlatforms.length} platform{lcPlatforms.length !== 1 ? 's' : ''}:{' '}
                  {lcPlatforms.map((p) => p.name).join(', ')}
                </p>
                <Button
                  type="button"
                  variant="default"
                  disabled={importing}
                  onClick={handleImport}
                >
                  {importing ? 'Importing…' : `Import ${selectedMeetIds.length > 1 ? `(${selectedMeetIds.length} days)` : ''}`}
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

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

          {numDays > 1 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-background accent-accent"
                checked={perDayPasswords}
                onChange={(e) => handlePerDayPasswordsChange(e.target.checked)}
              />
              <span className="text-sm text-primary">Use different password for each day</span>
            </label>
          )}

          {numDays > 1 && !perDayPasswords && (
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
          )}
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
                  onChange={(e) => updatePlatformName(pi, e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`sessions-${pi}`}>Sessions per day</Label>
                <Input
                  id={`sessions-${pi}`}
                  type="number"
                  min={1}
                  value={platform.sessionCount}
                  onChange={(e) => updatePlatformSessionCount(pi, Number(e.target.value))}
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

            {(perDayPasswords || numDays === 1) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`lc-password-${di}`}>LiftingCast password</Label>
                <Input
                  id={`lc-password-${di}`}
                  type="password"
                  placeholder="LiftingCast meet password"
                  value={day.liftingCastPassword}
                  onChange={(e) => updateDayPassword(di, e.target.value)}
                />
              </div>
            )}

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
                          (numDays === 1 || perDayPasswords ? !day.liftingCastPassword : !password)
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
