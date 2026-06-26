import { KEY_MAP, type VoteButton } from '@/lib/platformTypes'

const BUTTON_ORDER: VoteButton[] = ['white', 'red', 'blue', 'yellow']

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

export function KeyboardHintOverlay() {
  return (
    <div className="fixed bottom-4 right-4 bg-surface/80 border border-border rounded-lg px-4 py-3 text-xs text-secondary leading-relaxed">
      <div>{VOTE_HINTS}</div>
      <div className="mt-1">[Enter] Clock &nbsp; [Space] Reset votes</div>
    </div>
  )
}
