import { useParams } from 'react-router-dom'
import { PlatformDisplay } from '@/components/PlatformDisplay'
import { KeyboardHintOverlay } from '@/components/KeyboardHintOverlay'
import { usePlatformState } from '@/hooks/usePlatformState'

export default function PlatformView() {
  const { id } = useParams<{ id: string }>()
  const { config, votes, revealed, clock, connected, attemptChangeActive } = usePlatformState(id)

  if (!config.configFound) {
    return (
      <div className="platform-display min-h-screen bg-background flex items-center justify-center">
        <p className="text-secondary text-lg">Platform {id} is not configured.</p>
      </div>
    )
  }

  return (
    <div className="platform-display min-h-screen bg-background flex flex-col">
      <PlatformDisplay
        platformName={config.platformName}
        dayStr={config.dayStr}
        votes={votes}
        revealed={revealed}
        clock={clock}
        attemptChangeActive={attemptChangeActive}
      />

      <KeyboardHintOverlay />

      {connected === false && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
          DISCONNECTED
        </div>
      )}
    </div>
  )
}
