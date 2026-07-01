import {
  Role,
  Button,
  ACTIVE_ROLES,
  VALID_ROLES,
  ClockMode,
  ClockState,
} from './enums';
import { Remote } from './remote';
import { PlatformClock } from './platform-clock';
import { determineDecisionOutcome, DecisionOutcome } from './decisions';

const MAX_TOTAL_REMOTES = 10;
const MAX_ACTIVE_REMOTES = 3;
const DEFAULT_DECISION_DELAY = 1.0;

function now(): number {
  return performance.now() / 1000;
}

export interface PlatformSerialized {
  platformId: string;
  name: string | null;
  metadata: Record<string, unknown>;
  activeRemotes: Record<string, ReturnType<Remote['serialize']>>;
  decisionDelay: number;
  clock: ReturnType<PlatformClock['serialize']>;
  votes: Record<string, Button | null>;
  hasCompleteVoteSet: boolean;
  attemptChangeActive: boolean;
}

export class Platform {
  platformId: string;
  name: string | null;
  metadata: Record<string, unknown>;
  activeRemotes: Map<string, Remote> = new Map();
  inactiveRemotes: Map<string, Remote> = new Map();
  decisionDelay: number;
  clock: PlatformClock = new PlatformClock();
  attemptChangeActive = false;
  private _decisionReadyAt: number | null = null;

  constructor(params: {
    platformId: string;
    name?: string;
    metadata?: Record<string, unknown>;
    decisionDelay?: number;
  }) {
    this.platformId = params.platformId;
    this.name = params.name ?? null;
    this.metadata = params.metadata ?? {};
    this.decisionDelay = params.decisionDelay ?? DEFAULT_DECISION_DELAY;
  }

  registerRemote(
    remoteId: string,
    role: Role,
    options: {
      hasVibration?: boolean;
      hasDisplay?: boolean;
      metadata?: Record<string, unknown>;
      active?: boolean;
    } = {},
  ): Remote {
    if (!VALID_ROLES.has(role)) {
      throw new Error(
        `Invalid role: ${role}. Must be one of: left, right, chief, spare`,
      );
    }

    const totalCount = this.activeRemotes.size + this.inactiveRemotes.size;
    if (totalCount >= MAX_TOTAL_REMOTES) {
      throw new Error(
        `Platform ${this.platformId} already has ${MAX_TOTAL_REMOTES} remotes`,
      );
    }

    // Default to inactive — callers must explicitly opt in to active
    const active = options.active ?? false;

    if (active && this.activeRemotes.size >= MAX_ACTIVE_REMOTES) {
      throw new Error(
        `Platform ${this.platformId} already has 3 active remotes`,
      );
    }

    // Enforce role uniqueness only among active remotes
    if (active && role !== 'spare') {
      for (const remote of this.activeRemotes.values()) {
        if (remote.role === role) {
          throw new Error(
            `Role ${role} is already assigned to an active remote`,
          );
        }
      }
    }

    const remote = new Remote({
      remoteId,
      role,
      platformId: this.platformId,
      hasVibration: options.hasVibration,
      hasDisplay: options.hasDisplay,
      metadata: options.metadata,
    });

    if (active) {
      this.activeRemotes.set(remoteId, remote);
    } else {
      this.inactiveRemotes.set(remoteId, remote);
    }

    return remote;
  }

  addRemote(remote: Remote): void {
    if (this.allRemotes().size >= MAX_TOTAL_REMOTES) {
      throw new Error(
        `Platform ${this.platformId} already has ${MAX_TOTAL_REMOTES} remotes`,
      );
    }
    remote.platformId = this.platformId;
    this.inactiveRemotes.set(remote.remoteId, remote);
  }

  removeRemote(remoteId: string): Remote {
    const remote =
      this.activeRemotes.get(remoteId) ?? this.inactiveRemotes.get(remoteId);
    if (!remote) {
      throw new Error(
        `Remote ${remoteId} not found on platform ${this.platformId}`,
      );
    }
    this.activeRemotes.delete(remoteId);
    this.inactiveRemotes.delete(remoteId);
    return remote;
  }

  getRemote(remoteId: string): Remote {
    const remote =
      this.activeRemotes.get(remoteId) ?? this.inactiveRemotes.get(remoteId);
    if (!remote) {
      throw new Error(
        `Remote ${remoteId} not found on platform ${this.platformId}`,
      );
    }
    return remote;
  }

  hasRemote(remoteId: string): boolean {
    return (
      this.activeRemotes.has(remoteId) || this.inactiveRemotes.has(remoteId)
    );
  }

  castVote(remoteId: string, buttonName: Button): void {
    const remote = this.activeRemotes.get(remoteId);
    if (!remote) {
      throw new Error(`Active remote ${remoteId} not found`);
    }
    if (buttonName === 'clock') {
      throw new Error('Use handleClockButton for clock presses');
    }
    if (this.clock.mode === ClockMode.BREAK) {
      throw new Error('Cannot cast votes during break');
    }
    if (this.attemptChangeActive) {
      throw new Error('Cannot cast votes during attempt change');
    }
    if (this.clock.state() === ClockState.IDLE) {
      throw new Error('Cannot cast votes before the clock has started');
    }
    remote.pressButton(buttonName);

    if (this.hasCompleteVoteSet()) {
      this._decisionReadyAt = now() + this.decisionDelay;
    }
  }

  getRefereeVotes(): Record<string, Button | null> {
    const votes: Record<string, Button | null> = {};
    for (const remote of this.activeRemotes.values()) {
      if (ACTIVE_ROLES.has(remote.role)) {
        const btn = remote.lastButtonPressed;
        votes[remote.role] = btn === 'clock' ? null : btn;
      }
    }
    return votes;
  }

  hasCompleteVoteSet(): boolean {
    const votes = this.getRefereeVotes();
    for (const role of ACTIVE_ROLES) {
      if (!(role in votes) || votes[role] === null) {
        return false;
      }
    }
    return true;
  }

  activateRemote(remoteId: string): void {
    const remote = this.inactiveRemotes.get(remoteId);
    if (!remote) {
      throw new Error(`Inactive remote ${remoteId} not found`);
    }
    if (this.activeRemotes.size >= MAX_ACTIVE_REMOTES) {
      throw new Error('Cannot have more than 3 active remotes');
    }
    this.inactiveRemotes.delete(remoteId);
    this.activeRemotes.set(remoteId, remote);
  }

  deactivateRemote(remoteId: string): void {
    const remote = this.activeRemotes.get(remoteId);
    if (!remote) {
      throw new Error(`Active remote ${remoteId} not found`);
    }
    this.activeRemotes.delete(remoteId);
    this.inactiveRemotes.set(remoteId, remote);
  }

  resetVotes(): void {
    for (const remote of this.activeRemotes.values()) {
      remote.lastButtonPressed = null;
    }
    this._decisionReadyAt = null;
  }

  swapRemotes(
    activateRemoteId: string,
    deactivateRemoteId: string,
    newRole?: Role,
  ): void {
    const toActivate = this.inactiveRemotes.get(activateRemoteId);
    if (!toActivate) {
      throw new Error(`Inactive remote ${activateRemoteId} not found`);
    }
    const toDeactivate = this.activeRemotes.get(deactivateRemoteId);
    if (!toDeactivate) {
      throw new Error(`Active remote ${deactivateRemoteId} not found`);
    }
    if (newRole) {
      if (!VALID_ROLES.has(newRole) || newRole === 'spare') {
        throw new Error(`newRole must be one of: left, right, chief`);
      }
      toActivate.role = newRole;
    }
    this.deactivateRemote(deactivateRemoteId);
    this.activateRemote(activateRemoteId);
  }

  handleClockButton(remoteId: string, atTime?: number): void {
    const remote = this.activeRemotes.get(remoteId);
    if (!remote) {
      throw new Error(`Active remote ${remoteId} not found`);
    }
    if (!remote.hasClockButton) {
      throw new Error(`Remote ${remoteId} does not have a clock button`);
    }
    if (this.clock.mode === ClockMode.BREAK) {
      throw new Error('Cannot control clock during break');
    }
    if (this.attemptChangeActive) {
      throw new Error('Cannot control clock during attempt change');
    }
    remote.pressButton('clock');
    this.clock.handleChiefClockPress(atTime);
  }

  readyForAutoDecision(atTime?: number): boolean {
    const t = atTime ?? now();
    if (!this.hasCompleteVoteSet() || this._decisionReadyAt === null) {
      return false;
    }
    return t >= this._decisionReadyAt;
  }

  tryDetermineOutcome(atTime?: number): DecisionOutcome | null {
    const t = atTime ?? now();
    if (!this.readyForAutoDecision(t)) {
      return null;
    }
    return this.determineOutcome(true, t);
  }

  determineOutcome(
    requireDelay: boolean = false,
    atTime?: number,
  ): DecisionOutcome {
    const t = atTime ?? now();
    if (requireDelay && !this.readyForAutoDecision(t)) {
      throw new Error('Decision delay has not elapsed yet');
    }
    const outcome = determineDecisionOutcome(this);
    this.clock.resetToActive();
    this.resetVotes();
    return outcome;
  }

  updateMetadata(data: Record<string, unknown>): void {
    Object.assign(this.metadata, data);
  }

  allRemotes(): Map<string, Remote> {
    return new Map([...this.activeRemotes, ...this.inactiveRemotes]);
  }

  toggleAttemptChange(): void {
    this.attemptChangeActive = !this.attemptChangeActive;
  }

  clearRemotes(): void {
    this.activeRemotes.clear();
    this.inactiveRemotes.clear();
  }

  serialize(atTime?: number): PlatformSerialized {
    const t = atTime ?? now();
    const activeRemotes: Record<string, ReturnType<Remote['serialize']>> = {};
    for (const [id, remote] of this.activeRemotes) {
      activeRemotes[id] = remote.serialize();
    }
    return {
      platformId: this.platformId,
      name: this.name,
      metadata: this.metadata,
      activeRemotes,
      decisionDelay: this.decisionDelay,
      clock: this.clock.serialize(t),
      votes: this.getRefereeVotes(),
      hasCompleteVoteSet: this.hasCompleteVoteSet(),
      attemptChangeActive: this.attemptChangeActive,
    };
  }
}
