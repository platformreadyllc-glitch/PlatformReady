import { useCallback, useEffect, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { API } from '@/hooks/usePlatformSocket'
import { readActivePlatforms } from '@/lib/platformHelpers'

interface RemoteSerialized {
  remoteId: string
  role: string
  hasVibration: boolean
  hasDisplay: boolean
}

interface PlatformFull {
  platformId: string
  name: string | null
  activeRemotes: Record<string, RemoteSerialized>
  inactiveRemotes: Record<string, RemoteSerialized>
}

interface DragData {
  remoteId: string
  sourcePlatformId: string
  role: string
  isActive: boolean
}

const ROLES = ['left', 'chief', 'right'] as const

const ROLE_LABEL: Record<string, string> = { left: 'L', chief: 'C', right: 'R' }
const ROLE_COLOR: Record<string, string> = {
  left: 'text-blue-400',
  chief: 'text-yellow-400',
  right: 'text-red-400',
}

function isKb(remoteId: string) {
  return remoteId.startsWith('kb-')
}

function hwTags(r: RemoteSerialized): string {
  const tags = [r.hasVibration ? 'haptic' : '', r.hasDisplay ? 'display' : ''].filter(Boolean)
  return tags.length ? tags.join(' · ') : ''
}

// ── Active remote chip (draggable, lives inside a role slot) ─────────────────

function ActiveRemote({ remote, platformId }: { remote: RemoteSerialized; platformId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `active:${platformId}:${remote.remoteId}`,
    data: { remoteId: remote.remoteId, sourcePlatformId: platformId, role: remote.role, isActive: true } as DragData,
  })
  const hw = hwTags(remote)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex flex-col min-w-0 flex-1 cursor-grab select-none transition-opacity ${
        isDragging ? 'opacity-20' : ''
      }`}
    >
      <span className="text-xs font-mono text-primary font-medium truncate">{remote.remoteId}</span>
      <span className="text-xs text-secondary">
        {isKb(remote.remoteId) ? 'keyboard' : 'physical'}
        {hw ? ` · ${hw}` : ''}
      </span>
    </div>
  )
}

// ── Role slot (droppable container) ─────────────────────────────────────────

function RoleSlot({ platformId, role, remote }: { platformId: string; role: string; remote?: RemoteSerialized }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${platformId}:${role}`, data: { platformId, role } })

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border min-h-[2.75rem] transition-colors ${
        isOver
          ? 'border-accent bg-accent/10'
          : remote
            ? 'border-border bg-surface'
            : 'border-dashed border-border'
      }`}
    >
      <span className={`text-[11px] font-bold w-4 shrink-0 tabular-nums ${ROLE_COLOR[role] ?? 'text-secondary'}`}>
        {ROLE_LABEL[role] ?? role[0]?.toUpperCase()}
      </span>
      {remote ? (
        <ActiveRemote remote={remote} platformId={platformId} />
      ) : (
        <span className="text-xs text-secondary/60 italic">empty</span>
      )}
    </div>
  )
}

// ── Platform card ────────────────────────────────────────────────────────────

function PlatformRemoteCard({ platform }: { platform: PlatformFull }) {
  const byRole = Object.fromEntries(Object.values(platform.activeRemotes).map((r) => [r.role, r]))
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-primary">{platform.name ?? platform.platformId}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {ROLES.map((role) => (
          <RoleSlot key={role} platformId={platform.platformId} role={role} remote={byRole[role]} />
        ))}
      </div>
    </div>
  )
}

// ── Pool remote (draggable chip for an inactive remote) ──────────────────────

function PoolRemote({ id, remote, sourcePlatformId }: { id: string; remote: RemoteSerialized; sourcePlatformId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { remoteId: remote.remoteId, sourcePlatformId, role: remote.role, isActive: false } as DragData,
  })
  const hw = hwTags(remote)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-border bg-background cursor-grab select-none hover:border-accent transition-colors ${
        isDragging ? 'opacity-20' : ''
      }`}
    >
      <span className="text-xs font-mono text-primary font-medium">{remote.remoteId}</span>
      <span className="text-xs text-secondary">
        {isKb(remote.remoteId) ? 'keyboard' : 'physical'}
        {hw ? ` · ${hw}` : ''}
      </span>
    </div>
  )
}

// ── Available remotes pool (droppable) ───────────────────────────────────────

function AvailablePool({ platforms }: { platforms: PlatformFull[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })

  const pool = platforms.flatMap((p) =>
    Object.values(p.inactiveRemotes).map((r) => ({ ...r, sourcePlatformId: p.platformId }))
  )

  return (
    <div>
      <p className="text-sm font-medium text-secondary mb-3">Available Remotes</p>
      <div
        ref={setNodeRef}
        className={`min-h-24 rounded-xl border-2 border-dashed p-3 flex flex-wrap gap-2 items-start content-start transition-colors ${
          isOver ? 'border-accent bg-accent/5' : 'border-border'
        }`}
      >
        {pool.length === 0 ? (
          <span className="text-xs text-secondary self-center mx-auto py-4">
            Drag an active remote here to bench it
          </span>
        ) : (
          pool.map((r) => {
            const id = `inactive:${r.sourcePlatformId}:${r.remoteId}`
            return (
              <PoolRemote key={id} id={id} remote={r} sourcePlatformId={r.sourcePlatformId} />
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Drag overlay ghost ───────────────────────────────────────────────────────

function RemoteGhost({ remoteId }: { remoteId: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border border-accent bg-surface shadow-xl cursor-grabbing select-none pointer-events-none">
      <span className="text-xs font-mono text-primary font-medium">{remoteId}</span>
      <span className="text-xs text-secondary">{isKb(remoteId) ? 'keyboard' : 'physical'}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RemoteManagement() {
  const [platforms, setPlatforms] = useState<PlatformFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)

  const fetchPlatforms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const configured = readActivePlatforms()
      const activePlatformIds = configured.map((_, i) => `platform-${i + 1}`)

      await Promise.all(
        configured.map((p, i) =>
          fetch(`${API}/platforms/ensure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platformId: `platform-${i + 1}`, name: p.name }),
          })
        )
      )

      const res = await fetch(`${API}/platforms`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const byId: Record<string, PlatformFull> = await res.json()
      const all = Object.values(byId)
      setPlatforms(activePlatformIds.length > 0 ? all.filter((p) => activePlatformIds.includes(p.platformId)) : all)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlatforms() }, [fetchPlatforms])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragStart(e: DragStartEvent) {
    setActiveDrag(e.active.data.current as DragData)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null)
    const { active, over } = e
    if (!over) return

    const drag = active.data.current as DragData
    const overId = over.id.toString()

    // Bench: drag to pool → deactivate
    if (overId === 'pool') {
      if (!drag.isActive) return
      await fetch(`${API}/platforms/${drag.sourcePlatformId}/remotes/${drag.remoteId}/deactivate`, {
        method: 'POST',
      })
      await fetchPlatforms()
      return
    }

    // Activate/replace: drag to role slot
    if (!overId.startsWith('slot:')) return
    const [, targetPlatformId, targetRole] = overId.split(':')

    // Role must match
    if (drag.role !== targetRole) return

    // Keyboard remotes can only go back to their own platform
    if (isKb(drag.remoteId) && drag.sourcePlatformId !== targetPlatformId) return

    const targetPlatform = platforms.find((p) => p.platformId === targetPlatformId)
    const occupant = targetPlatform
      ? Object.values(targetPlatform.activeRemotes).find((r) => r.role === targetRole)
      : undefined

    // No-op: dropping active remote onto its own current slot
    if (drag.isActive && drag.sourcePlatformId === targetPlatformId && occupant?.remoteId === drag.remoteId) return

    // Transfer to target platform if the remote isn't already there
    let effectivePlatformId = drag.sourcePlatformId
    if (drag.sourcePlatformId !== targetPlatformId) {
      const r = await fetch(`${API}/platforms/${drag.sourcePlatformId}/remotes/${drag.remoteId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlatformId }),
      })
      if (!r.ok) { await fetchPlatforms(); return }
      effectivePlatformId = targetPlatformId
    }

    // Activate or replace
    if (occupant) {
      await fetch(`${API}/platforms/${effectivePlatformId}/remotes/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incomingRemoteId: drag.remoteId, outgoingRemoteId: occupant.remoteId }),
      })
    } else {
      await fetch(`${API}/platforms/${effectivePlatformId}/remotes/${drag.remoteId}/activate`, {
        method: 'POST',
      })
    }

    await fetchPlatforms()
  }

  if (loading && platforms.length === 0) {
    return <div className="flex items-center justify-center h-64 text-secondary">Loading…</div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-64 text-destructive">Error: {error}</div>
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">Remote Management</h1>
          <Button variant="outline" size="sm" onClick={fetchPlatforms} disabled={loading}>
            Refresh
          </Button>
        </div>

        {platforms.length === 0 ? (
          <p className="text-secondary text-sm">No platforms configured — go to Meet Setup first.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {platforms.map((p) => (
                <PlatformRemoteCard key={p.platformId} platform={p} />
              ))}
            </div>
            <AvailablePool platforms={platforms} />
          </>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? <RemoteGhost remoteId={activeDrag.remoteId} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
