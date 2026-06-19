import { RefereeLight } from '@/components/RefereeLight'
import { formatTime } from '@/lib/platformHelpers'
import type { ClockSnapshot, Role, VoteButton } from '@/lib/platformTypes'

interface Props {
  platformName: string
  dayStr: string
  votes: Record<Role, VoteButton | null>
  revealed: boolean
  clock: ClockSnapshot
}

export function PlatformDisplay({ platformName, dayStr, votes, revealed, clock }: Props) {
  const clockColorClass =
    clock.state === 'EXPIRED' ? 'text-red-500' :
      clock.remaining <= 30 ? 'text-yellow-400' :
        'text-primary'

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-border">
        <span className="text-[2vw] font-semibold text-primary tracking-wide">{platformName}</span>
        <span className="text-[1.2vw] text-secondary">{dayStr}</span>
      </header>

      {clock.mode === 'ACTIVE' ? (
        /* ── ACTIVE mode: lights + single clock ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-[6vh]">
          <div className="flex items-start gap-[5vw]">
            <RefereeLight vote={votes.left} revealed={revealed} />
            <RefereeLight vote={votes.chief} revealed={revealed} />
            <RefereeLight vote={votes.right} revealed={revealed} />
          </div>
          <span className={`text-[20vw] [font-family:'DSEG7ClassicBold',monospace] font-bold tabular-nums ${clockColorClass}`}>
            {formatTime(clock.remaining)}
          </span>
        </div>
      ) : (
        /* ── BREAK mode: two timers distributed evenly, no lights ── */
        <div className="flex-1 flex flex-col items-center justify-evenly">
          {/* Break remaining */}
          <div className="flex flex-col items-center gap-2">
            <span className={`text-[5vw] [font-family:'Orbitron',sans-serif] font-bold tabular-nums ${clockColorClass}`}>
              FLIGHT A STARTS IN:
            </span>
            <span className={`text-[15vw] [font-family:'DSEG7ClassicBold',monospace] font-bold tabular-nums ${clockColorClass}`}>
              {formatTime(clock.remaining)}
            </span>
          </div>

          {/* Opener window or locked indicator */}
          {clock.openingAttemptsOpen && clock.openingAttemptsRemaining !== null ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-[5vw] [font-family:'Orbitron',sans-serif] font-bold tabular-nums text-red-500">
                FLIGHT A OPENERS CLOSE:
              </span>
              <span className="text-[15vw] [font-family:'DSEG7ClassicBold',monospace] font-bold tabular-nums text-red-500">
                {formatTime(clock.openingAttemptsRemaining)}
              </span>

            </div>
          ) : (
            <span className="text-[5vw] [font-family:'Orbitron',sans-serif] font-bold tabular-nums text-red-500">
              OPENERS LOCKED
            </span>
          )}
        </div>
      )}
    </>
  )
}
