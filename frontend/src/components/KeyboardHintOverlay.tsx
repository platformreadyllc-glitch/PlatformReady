import { KEY_MAP, type VoteButton, type Role, type RemoteConnection } from '@/lib/platformTypes'

const BUTTON_ORDER: VoteButton[] = ['white', 'red', 'blue', 'yellow']
const ROLES: Role[] = ['left', 'chief', 'right']

function buildHints(): string {
  const byButton: Record<string, string[]> = {}
  for (const [key, [, button]] of Object.entries(KEY_MAP)) {
    if (!byButton[button]) byButton[button] = []
    byButton[button].push(key.toUpperCase())
  }
  return BUTTON_ORDER.map(
    (btn) => `${byButton[btn]?.join('/') ?? ''} = ${btn.charAt(0).toUpperCase()}${btn.slice(1)}`,
  ).join('   ')
}

const VOTE_HINTS = buildHints()

// Only the Scoring Table view renders this at all (the referee-facing
// Platform Display shouldn't show operator hints) - and even there, once a
// real remote is connected for every role, no slot is actually being
// controlled from the keyboard any more, so the hint just becomes clutter.
// A null status (an empty slot, or a kb-* virtual remote standing in for a
// real one - see isKbRemote()) still counts as "not connected": that slot
// still needs the keyboard.
export function KeyboardHintOverlay({
  remoteStatus,
}: {
  remoteStatus: Record<Role, RemoteConnection | null>
}) {
  const allConnected = ROLES.every((role) => remoteStatus[role]?.connected === true)
  if (allConnected) return null

  return (
    <div className="fixed bottom-4 right-4 bg-surface/80 border border-border rounded-lg px-4 py-3 text-xs text-secondary leading-relaxed">
      <div>{VOTE_HINTS}</div>
      <div className="mt-1">[Enter] Clock &nbsp; [Space] Reset votes</div>
    </div>
  )
}
