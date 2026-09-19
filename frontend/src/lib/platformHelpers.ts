import type { MeetSummary, MeetSummaryPlatform } from '@/lib/platformTypes'

// Active platforms for a given day of the (backend-fetched) meet summary -
// replaces the old readActivePlatforms() localStorage read. Pure - callers
// get the summary from useMeetSummary() and the day index from wherever
// they track "which day am I looking at" (usually summary.activeDayIndex
// itself, but PlatformView/ScoreTableView could in principle look at a
// specific day regardless of which one is "active" meet-wide).
export function activePlatformsForDay(
  summary: MeetSummary | null,
  dayIndex: number
): MeetSummaryPlatform[] {
  const platforms = summary?.days?.[dayIndex]?.platforms ?? []
  return platforms.filter((p) => p.active)
}

// The single platform at a raw (unfiltered) position for a given day -
// distinct from activePlatformsForDay() above, which filters to active-only
// first. /platform/:id (usePlatformState) indexes by raw position (the Nth
// configured slot, active or not - :id keeps meaning the same physical
// platform even if a different one is toggled inactive), while the nav
// links that point at those routes (App.tsx) and RemoteManagement's backend
// sync both number by position *within the active-only list* instead. Two
// different conventions that predate this helper split - preserved as-is
// here rather than unified, since unifying them would change which
// platform a given /platform/:id actually shows.
export function platformAtIndex(
  summary: MeetSummary | null,
  dayIndex: number,
  platformIndex: number
): MeetSummaryPlatform | undefined {
  return summary?.days?.[dayIndex]?.platforms?.[platformIndex]
}

// Advances (or otherwise changes) which day of a multi-day meet is
// currently running - deliberately not part of the password-gated Meet
// Setup save, see backend's ActiveDayDto comment. Fire-and-forget is not
// appropriate here (callers need to know it landed before trusting their
// own optimistic local state), so this returns the fetch promise.
export async function postActiveDay(
  index: number,
  completedIndices: number[]
): Promise<void> {
  const res = await fetch('/api/meet-config/active-day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, completedIndices }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
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
