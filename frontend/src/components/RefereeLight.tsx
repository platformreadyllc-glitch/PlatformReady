import type { VoteButton } from '@/lib/platformTypes'

const CIRCLE_DEFAULT = 'w-[20vw] h-[20vw] rounded-full'
const CIRCLE_COMPACT = 'w-10 h-10 rounded-full'

export function RefereeLight({
  vote,
  revealed,
  compact,
}: {
  vote: VoteButton | null
  revealed: boolean
  compact?: boolean
}) {
  const voted = vote !== null
  const circle = compact ? CIRCLE_COMPACT : CIRCLE_DEFAULT
  const stripW = compact ? 'w-10' : 'w-[20vw]'
  const stripH = compact ? 'h-1' : 'h-[1.5vw]'

  const stripClass =
    revealed && vote === 'blue' ? 'bg-blue-600' :
    revealed && vote === 'yellow' ? 'bg-yellow-400' :
    revealed && vote === 'red' ? 'bg-red-600' :
    null

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Circle: invisible → gray ring → colored */}
      {!voted ? (
        <div className={circle} />
      ) : !revealed ? (
        <div className={`${circle} border-4 border-secondary`} />
      ) : vote === 'white' ? (
        <div className={`${circle} bg-white`} />
      ) : (
        <div className={`${circle} bg-red-600`} />
      )}

      {/* Secondary color strip for blue / yellow / red cards; spacer when absent */}
      {stripClass
        ? <div className={`${stripW} ${stripH} rounded-sm ${stripClass}`} />
        : <div className={`${stripW} ${stripH}`} />
      }
    </div>
  )
}
