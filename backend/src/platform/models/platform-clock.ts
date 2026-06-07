import { ClockMode, ClockState } from './enums';

const ACTIVE_DURATION = 60.0;
const OPENING_ATTEMPTS_CUTOFF = 180.0;

export interface PlatformClockSerialized {
  mode: ClockMode;
  state: ClockState;
  remaining: number;
  duration: number;
  openingAttemptsOpen: boolean;
  openingAttemptsRemaining: number | null;
}

function now(): number {
  return performance.now() / 1000;
}

export class PlatformClock {
  mode: ClockMode = ClockMode.ACTIVE;
  private _duration: number = ACTIVE_DURATION;
  private _startedAt: number | null = null;
  private _running: boolean = false;

  configureBreak(durationSeconds: number): void {
    if (durationSeconds <= 0) {
      throw new Error('Break duration must be positive');
    }
    this.mode = ClockMode.BREAK;
    this._duration = durationSeconds;
    this._startedAt = null;
    this._running = false;
  }

  resetToActive(): void {
    this.mode = ClockMode.ACTIVE;
    this._duration = ACTIVE_DURATION;
    this._startedAt = null;
    this._running = false;
  }

  start(atTime?: number): void {
    const t = atTime ?? now();
    this._startedAt = t;
    this._running = true;
  }

  handleChiefClockPress(atTime?: number): void {
    const t = atTime ?? now();
    if (this.state(t) === ClockState.RUNNING) {
      this.resetToActive();
    } else {
      this.start(t);
    }
  }

  remaining(atTime?: number): number {
    const t = atTime ?? now();
    if (!this._running || this._startedAt === null) {
      return this._duration;
    }
    const elapsed = t - this._startedAt;
    return Math.max(0, this._duration - elapsed);
  }

  state(atTime?: number): ClockState {
    const t = atTime ?? now();
    if (!this._running) {
      return ClockState.IDLE;
    }
    if (this.remaining(t) <= 0) {
      return ClockState.EXPIRED;
    }
    return ClockState.RUNNING;
  }

  openingAttemptsOpen(atTime?: number): boolean {
    const t = atTime ?? now();
    if (this.mode !== ClockMode.BREAK) {
      return false;
    }
    return this.remaining(t) > OPENING_ATTEMPTS_CUTOFF;
  }

  openingAttemptsRemaining(atTime?: number): number {
    const t = atTime ?? now();
    if (this.mode !== ClockMode.BREAK) {
      return 0;
    }
    return Math.max(0, this.remaining(t) - OPENING_ATTEMPTS_CUTOFF);
  }

  serialize(atTime?: number): PlatformClockSerialized {
    const t = atTime ?? now();
    return {
      mode: this.mode,
      state: this.state(t),
      remaining: this.remaining(t),
      duration: this._duration,
      openingAttemptsOpen: this.openingAttemptsOpen(t),
      openingAttemptsRemaining:
        this.mode === ClockMode.BREAK ? this.openingAttemptsRemaining(t) : null,
    };
  }
}

export const BREAK_SHORT = 600.0;
export const BREAK_LONG = 1200.0;
