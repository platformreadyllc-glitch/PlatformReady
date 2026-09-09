export enum ClockMode {
  ACTIVE = 'ACTIVE',
  BREAK = 'BREAK',
}

export enum ClockState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  EXPIRED = 'EXPIRED',
}

export const VALID_ROLES = new Set(['left', 'right', 'chief', 'spare']);
export const ACTIVE_ROLES = new Set(['left', 'right', 'chief']);

export type Role = 'left' | 'right' | 'chief' | 'spare';
export type Button = 'red' | 'yellow' | 'blue' | 'white' | 'clock';
export type Decision = 'good' | 'bad';

// Every physical remote uses identical PCBs - the 5th/clock button is
// physically present on every unit but covered by an interchangeable case
// shell for side-configured ones. hardwareType reflects that fixed,
// firmware-reported configuration (never reassignable), distinct from
// `role`, which is the current platform/position assignment.
export const VALID_HARDWARE_TYPES = new Set(['side', 'chief']);
export type HardwareType = 'side' | 'chief';

// Which network interface a remote's live WS connection is currently
// riding, reported once at connect time (see esp-remotes.gateway.ts /
// firmware's wsInit()). null until the remote has connected at least once
// under firmware that reports it.
export type Transport = 'wifi' | 'ethernet' | null;
