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
