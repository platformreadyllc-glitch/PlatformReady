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

// Shared position convention used everywhere a referee slot is labeled by
// letter — remote management's role slots, and (per this label+color) the
// live connection badges on the platform display / director view.
export const ROLE_LABEL: Record<Role, string> = { left: 'L', chief: 'C', right: 'R' }
export const ROLE_COLOR: Record<Role, string> = {
  left: 'text-blue-400',
  chief: 'text-yellow-400',
  right: 'text-red-400',
}

export type Transport = 'wifi' | 'ethernet' | null

export interface RemoteConnection {
  connected: boolean
  transport: Transport
}

// kb-* remotes are the frontend's own virtual keyboard-simulated referees,
// not physical hardware - they never have a real connection to report.
export function isKbRemote(remoteId: string): boolean {
  return remoteId.startsWith('kb-')
}

export type ClockMode = 'ACTIVE' | 'BREAK'
export type ClockState = 'IDLE' | 'RUNNING' | 'EXPIRED'

export interface ClockSnapshot {
  mode: ClockMode
  state: ClockState
  remaining: number
  openingAttemptsOpen: boolean
  openingAttemptsRemaining: number | null
  duration?: number
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
