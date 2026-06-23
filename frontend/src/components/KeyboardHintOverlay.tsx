export function KeyboardHintOverlay() {
  return (
    <div className="fixed bottom-4 right-4 bg-surface/80 border border-border rounded-lg px-4 py-3 text-xs text-secondary leading-relaxed">
      <div>Q/A/Z = White &nbsp; W/S/X = Red &nbsp; E/D/C = Blue &nbsp; R/F/V = Yellow</div>
      <div className="mt-1">[Enter] Clock &nbsp; [Space] Reset votes</div>
    </div>
  )
}
