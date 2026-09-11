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

// Which physical network interface a remote is currently connected over.
// null until the remote's first WS connection reports it (or if it's
// running firmware old enough not to send it at all).
export type Transport = 'wifi' | 'ethernet' | null;
