import type { VoteButton } from '@/lib/platformTypes'

const CIRCLE = 'w-[20vw] h-[20vw] rounded-full'

export function RefereeLight({ vote, revealed }: { vote: VoteButton | null; revealed: boolean }) {
  const voted = vote !== null

  const stripClass =
    revealed && vote === 'blue' ? 'bg-blue-600' :
    revealed && vote === 'yellow' ? 'bg-yellow-400' :
    revealed && vote === 'red' ? 'bg-red-600' :
    null

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Circle: invisible → gray ring → colored */}
      {!voted ? (
        <div className={CIRCLE} />
      ) : !revealed ? (
        <div className={`${CIRCLE} border-4 border-secondary`} />
      ) : vote === 'white' ? (
        <div className={`${CIRCLE} bg-white`} />
      ) : (
        <div className={`${CIRCLE} bg-red-600`} />
      )}

      {/* Secondary color strip for blue / yellow / red cards; spacer when absent */}
      {stripClass
        ? <div className={`w-[20vw] h-[1.5vw] rounded-sm ${stripClass}`} />
        : <div className="w-[20vw] h-[1.5vw]" />
      }
    </div>
  )
}
