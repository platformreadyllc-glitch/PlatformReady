import { STORAGE_KEY, type StoredMeetConfig } from '@/lib/platformTypes'

const ACTIVE_DAY_KEY = 'platformready_active_day'

interface ActiveDayState { index: number; completedIndices: number[] }

function defaultActiveDayState(): ActiveDayState { return { index: 0, completedIndices: [] } }

export function readActiveDayState(): ActiveDayState {
  try {
    const raw = localStorage.getItem(ACTIVE_DAY_KEY)
    if (!raw) return defaultActiveDayState()
    return JSON.parse(raw) as ActiveDayState
  } catch {
    return defaultActiveDayState()
  }
}

export function writeActiveDayState(state: ActiveDayState): void {
  localStorage.setItem(ACTIVE_DAY_KEY, JSON.stringify(state))
}

export function readActivePlatforms(): Array<{ name: string }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const config: StoredMeetConfig = JSON.parse(raw)
    const dayIndex = readActiveDayState().index
    const platforms = config.days?.[dayIndex]?.platforms ?? []
    return platforms.filter((p) => p.active)
  } catch {
    return []
  }
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function dayLabel(startDate: string, index: number): string {
  if (!startDate) return `Day ${index + 1}`
  const date = new Date(startDate)
  date.setDate(date.getDate() + index)
  return `Day ${index + 1} — ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}
