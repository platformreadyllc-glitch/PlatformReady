import { Wifi, EthernetPort } from 'lucide-react'
import { ROLE_LABEL, ROLE_COLOR, type Role, type RemoteConnection } from '@/lib/platformTypes'

// Position letter (L/C/R, same blue/yellow/red convention as
// RemoteManagement.tsx's role slots) plus a wifi/ethernet icon for that
// position's physical remote - icon shape is the transport (wifi vs
// ethernet), color is connected (green) vs disconnected (red). `status`
// null means no physical remote is in this slot at all (kb-* virtual
// remotes, or nothing assigned yet) - callers should skip rendering this
// rather than showing a permanently-red badge for a slot with nothing to
// report on.
export function RemoteConnectionBadge({
  role,
  status,
  size = 14,
  labelClass = 'text-xs',
}: {
  role: Role
  status: RemoteConnection
  size?: number
  labelClass?: string
}) {
  const Icon = status.transport === 'ethernet' ? EthernetPort : Wifi
  const colorClass = status.connected ? 'text-green-500' : 'text-red-500'

  return (
    <div
      className="flex items-center gap-1"
      title={`${role} remote: ${status.connected ? 'connected' : 'disconnected'}`}
    >
      <span className={`font-bold ${labelClass} ${ROLE_COLOR[role]}`}>{ROLE_LABEL[role]}</span>
      <Icon size={size} className={colorClass} />
    </div>
  )
}
