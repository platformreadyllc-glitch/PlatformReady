import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { API } from '@/hooks/usePlatformSocket'
import { readActivePlatforms } from '@/lib/platformHelpers'

interface RemoteSerialized {
  remoteId: string
  role: 'left' | 'right' | 'chief' | 'spare'
  hasVibration: boolean
  hasDisplay: boolean
  connected: boolean
}

interface PlatformFull {
  platformId: string
  name: string | null
  activeRemotes: Record<string, RemoteSerialized>
  inactiveRemotes: Record<string, RemoteSerialized>
}

const ROLE_ORDER: Array<RemoteSerialized['role']> = ['left', 'chief', 'right']

function remoteType(remoteId: string): 'Keyboard' | 'Physical' {
  return remoteId.startsWith('kb-') ? 'Keyboard' : 'Physical'
}

function hardwareLabel(r: RemoteSerialized): string {
  const parts: string[] = []
  if (r.hasVibration) parts.push('Haptic')
  if (r.hasDisplay) parts.push('Display')
  return parts.length > 0 ? parts.join(', ') : '—'
}

export default function RemoteManagement() {
  const [platforms, setPlatforms] = useState<PlatformFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlatforms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const configured = readActivePlatforms()
      const activePlatformIds = configured.map((_, i) => `platform-${i + 1}`)

      // Ensure every configured platform exists in the backend before fetching.
      // This mirrors what the platform display pages do on mount, so Remote
      // Management works without requiring those pages to have been visited first.
      await Promise.all(
        configured.map((p, i) =>
          fetch(`${API}/platforms/ensure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platformId: `platform-${i + 1}`, name: p.name }),
          }),
        ),
      )

      const res = await fetch(`${API}/platforms`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const byId: Record<string, PlatformFull> = await res.json()
      const all = Object.values(byId)
      const filtered = activePlatformIds.length > 0
        ? all.filter((p) => activePlatformIds.includes(p.platformId))
        : all
      setPlatforms(filtered)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlatforms() }, [fetchPlatforms])

  async function handleActivate(platformId: string, remoteId: string) {
    await fetch(`${API}/platforms/${platformId}/remotes/${remoteId}/activate`, {
      method: 'POST',
    })
    await fetchPlatforms()
  }

  async function handleDeactivate(platformId: string, remoteId: string) {
    await fetch(`${API}/platforms/${platformId}/remotes/${remoteId}/deactivate`, {
      method: 'POST',
    })
    await fetchPlatforms()
  }

  async function handleReplace(
    platformId: string,
    incomingRemoteId: string,
    outgoingRemoteId: string,
  ) {
    await fetch(`${API}/platforms/${platformId}/remotes/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incomingRemoteId, outgoingRemoteId }),
    })
    await fetchPlatforms()
  }

  async function handleTransfer(fromPlatformId: string, remoteId: string, targetPlatformId: string) {
    await fetch(`${API}/platforms/${fromPlatformId}/remotes/${remoteId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPlatformId }),
    })
    await fetchPlatforms()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-secondary">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Error: {error}
      </div>
    )
  }

  if (platforms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-secondary">
        No platforms configured — go to Meet Setup first.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-primary">Remote Management</h1>
        <Button variant="outline" size="sm" onClick={fetchPlatforms}>
          Refresh
        </Button>
      </div>

      {platforms.map((platform) => {
        const activeList = ROLE_ORDER.flatMap((role) =>
          Object.values(platform.activeRemotes).filter((r) => r.role === role),
        ).concat(
          Object.values(platform.activeRemotes).filter(
            (r) => !ROLE_ORDER.includes(r.role),
          ),
        )
        const inactiveList = Object.values(platform.inactiveRemotes)

        return (
          <Card key={platform.platformId}>
            <CardHeader>
              <CardTitle>{platform.name ?? platform.platformId}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* Active remotes */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-secondary mb-2">
                  Active
                </h2>
                {activeList.length === 0 ? (
                  <p className="text-secondary text-sm">No active remotes.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-secondary border-b border-border">
                        <th className="pb-2 pr-4 font-medium">Role</th>
                        <th className="pb-2 pr-4 font-medium">Remote ID</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 font-medium">Hardware</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {activeList.map((r) => (
                        <tr key={r.remoteId} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4 capitalize text-primary">{r.role}</td>
                          <td className="py-2 pr-4 font-mono text-primary">{r.remoteId}</td>
                          <td className="py-2 pr-4 text-secondary">{remoteType(r.remoteId)}</td>
                          <td className="py-2 text-secondary">{hardwareLabel(r)}</td>
                          <td className="py-2 pl-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeactivate(platform.platformId, r.remoteId)}
                            >
                              Bench
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Inactive remotes */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-secondary mb-2">
                  Inactive
                </h2>
                {inactiveList.length === 0 ? (
                  <p className="text-secondary text-sm">No inactive remotes.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-secondary border-b border-border">
                        <th className="pb-2 pr-4 font-medium">Remote ID</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 pr-4 font-medium">Hardware</th>
                        <th className="pb-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inactiveList.map((incoming) => {
                        const activeCount = activeList.length
                        const hasOpenSlot = activeCount < 3
                        const otherPlatforms = platforms.filter(
                          (p) => p.platformId !== platform.platformId,
                        )

                        return (
                          <tr key={incoming.remoteId} className="border-b border-border last:border-0">
                            <td className="py-2 pr-4 font-mono text-primary">{incoming.remoteId}</td>
                            <td className="py-2 pr-4 text-secondary">{remoteType(incoming.remoteId)}</td>
                            <td className="py-2 pr-4 text-secondary">{hardwareLabel(incoming)}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-2">
                                {hasOpenSlot ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleActivate(platform.platformId, incoming.remoteId)
                                    }
                                  >
                                    Activate
                                  </Button>
                                ) : (() => {
                                  const outgoing = activeList.find((a) => a.role === incoming.role)
                                  return outgoing ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleReplace(
                                          platform.platformId,
                                          incoming.remoteId,
                                          outgoing.remoteId,
                                        )
                                      }
                                    >
                                      Replace {incoming.role}
                                    </Button>
                                  ) : (
                                    <span className="text-secondary text-sm">
                                      No active {incoming.role} to replace
                                    </span>
                                  )
                                })()}
                                {otherPlatforms.map((target) => (
                                  <Button
                                    key={target.platformId}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleTransfer(
                                        platform.platformId,
                                        incoming.remoteId,
                                        target.platformId,
                                      )
                                    }
                                  >
                                    Move to {target.name ?? target.platformId}
                                  </Button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
