export interface StoredPlatform {
  name: string
  active: boolean
}

export interface StoredMeetConfig {
  startDate: string
  days: Array<{ platforms: StoredPlatform[] }>
}

export type VoteButton = 'white' | 'red' | 'blue' | 'yellow'
export type Role = 'left' | 'chief' | 'right'

export type ClockMode = 'ACTIVE' | 'BREAK'
export type ClockState = 'IDLE' | 'RUNNING' | 'EXPIRED'

export interface ClockSnapshot {
  mode: ClockMode
  state: ClockState
  remaining: number
  openingAttemptsOpen: boolean
  openingAttemptsRemaining: number | null
}

export const ACTIVE_DURATION = 60
export const OPENER_LOCK_CUTOFF = 180  // openers lock when break has ≤ 3 min remaining

export const INITIAL_CLOCK: ClockSnapshot = {
  mode: 'ACTIVE',
  state: 'IDLE',
  remaining: ACTIVE_DURATION,
  openingAttemptsOpen: false,
  openingAttemptsRemaining: null,
}

export const INITIAL_VOTES: Record<Role, VoteButton | null> = {
  left: null,
  chief: null,
  right: null,
}

export const STORAGE_KEY = 'platformready_meet'

export const KEY_MAP: Record<string, [Role, VoteButton]> = {
  q: ['left', 'white'],  w: ['left', 'red'],   e: ['left', 'blue'],   r: ['left', 'yellow'],
  a: ['chief', 'white'], s: ['chief', 'red'],  d: ['chief', 'blue'],  f: ['chief', 'yellow'],
  z: ['right', 'white'], x: ['right', 'red'],  c: ['right', 'blue'],  v: ['right', 'yellow'],
}
