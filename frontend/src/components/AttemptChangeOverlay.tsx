import React, { useEffect, useRef, useState, useCallback } from "react";

export interface AttemptChangeOverlayProps {
  active: boolean;
  title?: string;
  subtitle?: string;
  segments?: number;
  stepMs?: number;
  onReady?: () => void;
}

interface TailStop {
  alpha: number;
  glow: string | null;
}

const TAIL: TailStop[] = [
  { alpha: 1.0, glow: "0 0 10px 2px" },
  { alpha: 0.5, glow: "0 0 6px 1px" },
  { alpha: 0.2, glow: null },
];

const LIT_COLOR = "245, 158, 11"; // amber-500, matches scoring table buttons

function ChaseRow({
  segments,
  headIndex,
  direction,
  reverseLabel,
}: {
  segments: number;
  headIndex: number;
  direction: 1 | -1;
  reverseLabel: string;
}) {
  return (
    <div className="ac-row" role="presentation" aria-hidden="true" data-row={reverseLabel}>
      {Array.from({ length: segments }, (_, i) => {
        const offset = (headIndex - i) * direction;
        const tail = offset >= 0 && offset < TAIL.length ? TAIL[offset] : null;
        const style: React.CSSProperties = tail
          ? {
              background: `rgba(${LIT_COLOR}, ${tail.alpha})`,
              boxShadow: tail.glow ? `${tail.glow} rgba(${LIT_COLOR}, ${tail.alpha * 0.9})` : "none",
            }
          : { background: "transparent", boxShadow: "none" };
        return <div className="ac-cell" key={i} style={style} />;
      })}
    </div>
  );
}

export default function AttemptChangeOverlay({
  active,
  title = "ATTEMPT CHANGE",
  subtitle,
  segments = 14,
  stepMs = 70,
  onReady,
}: AttemptChangeOverlayProps) {
  const [topPos, setTopPos] = useState(0);
  const [topDir, setTopDir] = useState<1 | -1>(1);
  const [botPos, setBotPos] = useState(segments - 1);
  const [botDir, setBotDir] = useState<1 | -1>(-1);

  const [flashOn, setFlashOn] = useState(false);
  const [ambient, setAmbient] = useState(0);
  const [glitchOffset, setGlitchOffset] = useState<{ r: number; b: number; main: number } | null>(null);

  // Refs shadow direction/position so the step loop always reads current values
  // without a stale closure (direction state alone would be captured at effect-run time)
  const topDirRef = useRef<1 | -1>(1);
  const topPosRef = useRef(0);
  const botDirRef = useRef<1 | -1>(-1);
  const botPosRef = useRef(segments - 1);

  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flickerLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const glitchTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAllTimers = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    if (flickerLoopRef.current) clearInterval(flickerLoopRef.current);
    glitchTimersRef.current.forEach(clearTimeout);
    glitchTimersRef.current = [];
  }, []);

  const runGlitchBurst = useCallback(() => {
    setFlashOn(true);
    requestAnimationFrame(() => setFlashOn(false));

    setAmbient(0.6);
    const t0 = setTimeout(() => setAmbient(0), 70);
    glitchTimersRef.current.push(t0);

    let glitches = 0;
    const maxGlitches = 5;
    const fire = () => {
      glitches += 1;
      const dx = Math.random() * 12 - 6;
      setGlitchOffset({ r: dx, b: -dx, main: Math.random() * 4 - 2 });
      const clear = setTimeout(() => setGlitchOffset(null), 60);
      glitchTimersRef.current.push(clear);
      if (glitches < maxGlitches) {
        const next = setTimeout(fire, 160);
        glitchTimersRef.current.push(next);
      }
    };
    fire();
  }, []);

  useEffect(() => {
    if (!active) return;

    const step = () => {
      // Top bar — fire flash exactly when it hits a wall (same JS tick as position update)
      const nextTop = topPosRef.current + topDirRef.current;
      if (nextTop >= segments - 1 || nextTop <= 0) {
        topDirRef.current = topDirRef.current === 1 ? -1 : 1;
        setTopDir(topDirRef.current);
        runGlitchBurst();
      }
      topPosRef.current = Math.max(0, Math.min(segments - 1, nextTop));
      setTopPos(topPosRef.current);

      // Bottom bar (no extra flash — bars are in opposite phase so they hit ends together)
      const nextBot = botPosRef.current + botDirRef.current;
      if (nextBot >= segments - 1 || nextBot <= 0) {
        botDirRef.current = botDirRef.current === 1 ? -1 : 1;
        setBotDir(botDirRef.current);
      }
      botPosRef.current = Math.max(0, Math.min(segments - 1, nextBot));
      setBotPos(botPosRef.current);

      stepTimerRef.current = setTimeout(step, stepMs);
    };

    stepTimerRef.current = setTimeout(step, stepMs);
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, [active, segments, stepMs, runGlitchBurst]);

  useEffect(() => {
    if (!active) {
      clearAllTimers();
      setGlitchOffset(null);
      setFlashOn(false);
      setAmbient(0);
      return;
    }

    runGlitchBurst(); // initial burst when overlay appears; subsequent bursts driven by step boundary detection

    return () => {
      clearAllTimers();
    };
  }, [active, runGlitchBurst, clearAllTimers]);

  useEffect(() => {
    if (active) {
      topPosRef.current = 0;
      topDirRef.current = 1;
      botPosRef.current = segments - 1;
      botDirRef.current = -1;
      setTopPos(0);
      setTopDir(1);
      setBotPos(segments - 1);
      setBotDir(-1);
      onReady?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, segments]);

  if (!active) return null;

  return (
    <div className="ac-overlay" role="status" aria-live="polite">
      <style>{STYLES}</style>

      <div className="ac-amber-wash" style={{ opacity: ambient }} />

      <ChaseRow segments={segments} headIndex={topPos} direction={topDir} reverseLabel="top" />

      <div className="ac-textwrap">
        <div className="ac-stack">
          <div
            className="ac-main"
            style={glitchOffset ? { transform: `translateX(${glitchOffset.main}px)` } : undefined}
          >
            {title}
          </div>
          {glitchOffset && (
            <>
              <div
                className="ac-ghost ac-ghost-r"
                style={{ opacity: 0.6, transform: `translateX(${glitchOffset.r}px)` }}
              >
                {title}
              </div>
              <div
                className="ac-ghost ac-ghost-b"
                style={{ opacity: 0.6, transform: `translateX(${glitchOffset.b}px)` }}
              >
                {title}
              </div>
            </>
          )}
          {subtitle && <div className="ac-subtitle">{subtitle}</div>}
        </div>
      </div>

      <ChaseRow segments={segments} headIndex={botPos} direction={botDir} reverseLabel="bottom" />

      <div className="ac-flash" style={{ opacity: flashOn ? 0.85 : 0 }} />
    </div>
  );
}

const STYLES = `
.ac-overlay {
  position: absolute;
  inset: 0;
  background: var(--background);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-family: system-ui, -apple-system, sans-serif;
}
.ac-amber-wash {
  position: absolute;
  inset: 0;
  background: #412402;
  transition: opacity 0.08s linear;
}
.ac-flash {
  position: absolute;
  inset: 0;
  background: #ffffff;
  pointer-events: none;
  transition: opacity 0.12s ease-out;
}
.ac-row {
  position: relative;
  display: flex;
  gap: 0.4vw;
  height: 3vh;
  margin: 0 3vw;
  z-index: 2;
}
.ac-row[data-row="top"] { margin-bottom: 3vh; }
.ac-row[data-row="bottom"] { margin-top: 3vh; }
.ac-cell {
  flex: 1;
  border-radius: 3px;
  transition: background 0.04s linear, box-shadow 0.04s linear;
}
.ac-textwrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.ac-stack {
  position: relative;
  text-align: center;
}
.ac-main {
  font-family: 'Orbitron', sans-serif;
  text-transform: uppercase;
  font-size: 15vw;
  font-weight: 500;
  letter-spacing: 0.3vw;
  color: #f0f0f0;
  position: relative;
}
.ac-ghost {
  font-family: 'Orbitron', sans-serif;
  text-transform: uppercase;
  font-size: 15vw;
  font-weight: 500;
  letter-spacing: 0.3vw;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  mix-blend-mode: screen;
  pointer-events: none;
}
.ac-ghost-r { color: #E24B4A; }
.ac-ghost-b { color: #378ADD; }
.ac-subtitle {
  font-size: 2.5vw;
  font-weight: 400;
  letter-spacing: 0.2vw;
  color: #FAC775;
  margin-top: 1.5vh;
  opacity: 0.85;
}
`;
