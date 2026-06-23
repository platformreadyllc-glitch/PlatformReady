import { useParams } from 'react-router-dom'
import { PlatformDisplay } from '@/components/PlatformDisplay'
import { KeyboardHintOverlay } from '@/components/KeyboardHintOverlay'
import { usePlatformState } from '@/hooks/usePlatformState'

export default function PlatformView() {
  const { id } = useParams<{ id: string }>()
  const { config, votes, revealed, clock, attemptChangeActive } = usePlatformState(id)

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
    </div>
  )
}
