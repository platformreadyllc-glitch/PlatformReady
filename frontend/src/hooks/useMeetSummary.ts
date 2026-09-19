import { useCallback, useEffect, useState } from 'react'
import type { MeetSummary } from '@/lib/platformTypes'

// Public, secret-free meet config, shared across every browser on the LAN -
// see platformTypes.ts's MeetSummary and the backend's
// GET /meet-config/summary. Replaces the old readActivePlatforms()/
// readActiveDayState() localStorage reads (App.tsx's nav,
// RemoteManagement's platform sync, usePlatformState's per-platform
// config), which only ever reflected whichever one browser last ran Meet
// Setup.
export function useMeetSummary() {
  const [summary, setSummary] = useState<MeetSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const refresh = useCallback(() => setRefreshIndex((i) => i + 1), [])

  useEffect(() => {
    let cancelled = false
    // Not reset to true on refresh() calls (only starts true, for the
    // initial load) - nothing currently reads `loading` past first mount,
    // and resetting it here synchronously inside the effect body is
    // exactly the pattern eslint-plugin-react-hooks's set-state-in-effect
    // rule flags.
    fetch('/api/meet-config/summary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MeetSummary | null) => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshIndex])

  return { summary, loading, refresh }
}
