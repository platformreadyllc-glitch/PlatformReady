import { Role, Button, ACTIVE_ROLES, VALID_ROLES } from './enums';
import { Remote } from './remote';
import { PlatformClock } from './platform-clock';
import { determineDecisionOutcome, DecisionOutcome } from './decisions';

const MAX_TOTAL_REMOTES = 4;
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
  inactiveRemotes: Record<string, ReturnType<Remote['serialize']>>;
  decisionDelay: number;
  clock: ReturnType<PlatformClock['serialize']>;
  votes: Record<string, Button | null>;
  hasCompleteVoteSet: boolean;
}

export class Platform {
  platformId: string;
  name: string | null;
  metadata: Record<string, unknown>;
  activeRemotes: Map<string, Remote> = new Map();
  inactiveRemotes: Map<string, Remote> = new Map();
  decisionDelay: number;
  clock: PlatformClock = new PlatformClock();
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
      isSpare?: boolean;
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

    const isSpare = options.isSpare ?? role === 'spare';
    const active = options.active ?? !isSpare;

    if (active && this.activeRemotes.size >= MAX_ACTIVE_REMOTES) {
      throw new Error(
        `Platform ${this.platformId} already has 3 active remotes`,
      );
    }

    // Enforce role uniqueness across all remotes (active + inactive)
    if (!isSpare) {
      for (const remote of this.allRemotes().values()) {
        if (remote.role === role) {
          throw new Error(`Role ${role} is already assigned`);
        }
      }
    }

    const remote = new Remote({
      remoteId,
      role,
      platformId: this.platformId,
      isSpare,
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
    remote.pressButton(buttonName);

    if (this.hasCompleteVoteSet()) {
      this._decisionReadyAt = now() + this.decisionDelay;
    }
  }

  getRefereeVotes(): Record<string, Button | null> {
    const votes: Record<string, Button | null> = {};
    for (const remote of this.activeRemotes.values()) {
      if (ACTIVE_ROLES.has(remote.role)) {
        votes[remote.role] = remote.lastButtonPressed;
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

  substituteSpare(targetRole: Role): Remote {
    if (!ACTIVE_ROLES.has(targetRole)) {
      throw new Error(`Target role must be one of: left, right, chief`);
    }

    const spare = Array.from(this.inactiveRemotes.values()).find(
      (r) => r.isSpare,
    );
    if (!spare) {
      throw new Error('No spare remote available — key: spare');
    }

    const currentActive = Array.from(this.activeRemotes.values()).find(
      (r) => r.role === targetRole,
    );
    if (!currentActive) {
      throw new Error(`No active remote found for role: ${targetRole}`);
    }
    this.deactivateRemote(currentActive.remoteId);

    spare.configureSpareAs(targetRole);
    this.activateRemote(spare.remoteId);
    return spare;
  }

  handleClockButton(remoteId: string, atTime?: number): void {
    const remote = this.activeRemotes.get(remoteId);
    if (!remote) {
      throw new Error(`Active remote ${remoteId} not found`);
    }
    if (!remote.hasClockButton) {
      throw new Error(`Remote ${remoteId} does not have a clock button`);
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
    const inactiveRemotes: Record<string, ReturnType<Remote['serialize']>> = {};
    for (const [id, remote] of this.inactiveRemotes) {
      inactiveRemotes[id] = remote.serialize();
    }
    return {
      platformId: this.platformId,
      name: this.name,
      metadata: this.metadata,
      activeRemotes,
      inactiveRemotes,
      decisionDelay: this.decisionDelay,
      clock: this.clock.serialize(t),
      votes: this.getRefereeVotes(),
      hasCompleteVoteSet: this.hasCompleteVoteSet(),
    };
  }
}
