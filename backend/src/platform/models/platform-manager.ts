import { Platform, PlatformSerialized } from './platform';
import { Remote, RemoteSerialized } from './remote';
import { Role, VALID_ROLES } from './enums';

export interface PoolEntry extends RemoteSerialized {
  sourcePlatformId: string | null;
}

export class PlatformManager {
  private _platforms: Map<string, Platform> = new Map();
  // Physical remotes that are not currently active on any platform.
  readonly physicalPool: Map<string, Remote> = new Map();
  // Claim map: records which platform a physical remote should register on after reboot.
  // Updated whenever a physical remote is activated on a platform.
  private _remoteClaims: Map<string, string> = new Map();

  private isKb(remoteId: string): boolean {
    return remoteId.startsWith('kb-');
  }

  addPlatform(platform: Platform): void {
    if (this._platforms.has(platform.platformId)) {
      throw new Error(`Platform ${platform.platformId} already exists`);
    }
    this._platforms.set(platform.platformId, platform);
  }

  getPlatform(platformId: string): Platform {
    const platform = this._platforms.get(platformId);
    if (!platform) {
      throw new Error(`Platform ${platformId} not found`);
    }
    return platform;
  }

  removePlatform(platformId: string): Platform {
    const platform = this.getPlatform(platformId);
    this._platforms.delete(platformId);
    return platform;
  }

  hasPlatform(platformId: string): boolean {
    return this._platforms.has(platformId);
  }

  listPlatformIds(): string[] {
    return Array.from(this._platforms.keys());
  }

  listPlatforms(): Platform[] {
    return Array.from(this._platforms.values());
  }

  findRemotePlatform(remoteId: string): Platform | null {
    for (const platform of this._platforms.values()) {
      if (platform.hasRemote(remoteId)) {
        return platform;
      }
    }
    return null;
  }

  getRemoteClaim(remoteId: string): string | undefined {
    return this._remoteClaims.get(remoteId);
  }

  // Register a new physical remote (non-kb-*) into the unassigned pool.
  // Idempotent: returns the existing remote if already registered.
  registerPhysical(
    platformId: string,
    remoteId: string,
    role: Role,
    options: { hasVibration?: boolean; hasDisplay?: boolean } = {},
  ): Remote {
    const poolEntry = this.physicalPool.get(remoteId);
    if (poolEntry) return poolEntry;
    for (const p of this._platforms.values()) {
      const active = p.activeRemotes.get(remoteId);
      if (active) return active;
    }
    const remote = new Remote({ remoteId, role, platformId, ...options });
    this.physicalPool.set(remoteId, remote);
    return remote;
  }

  // Activate a remote onto a platform's active slot.
  // kb-* remotes come from the platform's own inactiveRemotes.
  // Physical remotes come from physicalPool.
  activateRemote(platformId: string, remoteId: string): void {
    const platform = this.getPlatform(platformId);
    if (this.isKb(remoteId)) {
      platform.activateRemote(remoteId);
    } else {
      const remote = this.physicalPool.get(remoteId);
      if (!remote) throw new Error(`Remote ${remoteId} not found in pool`);
      if (platform.activeRemotes.size >= 3) {
        throw new Error('Cannot have more than 3 active remotes');
      }
      this.physicalPool.delete(remoteId);
      remote.platformId = platformId;
      platform.activeRemotes.set(remoteId, remote);
      this._remoteClaims.set(remoteId, platformId);
    }
  }

  // Deactivate a remote from a platform.
  // kb-* remotes return to the platform's inactiveRemotes.
  // Physical remotes return to physicalPool.
  deactivateRemote(platformId: string, remoteId: string): void {
    const platform = this.getPlatform(platformId);
    const remote = platform.activeRemotes.get(remoteId);
    if (!remote) {
      throw new Error(`Active remote ${remoteId} not found on platform ${platformId}`);
    }
    platform.activeRemotes.delete(remoteId);
    if (this.isKb(remoteId)) {
      platform.inactiveRemotes.set(remoteId, remote);
    } else {
      this.physicalPool.set(remoteId, remote);
    }
  }

  // Atomically swap an inactive/pool remote in for an active one.
  replaceRemote(
    platformId: string,
    incomingId: string,
    outgoingId: string,
    newRole?: Role,
  ): void {
    const platform = this.getPlatform(platformId);
    const isIncomingKb = this.isKb(incomingId);
    const incoming = isIncomingKb
      ? platform.inactiveRemotes.get(incomingId)
      : this.physicalPool.get(incomingId);
    if (!incoming) throw new Error(`Remote ${incomingId} not found`);
    const outgoing = platform.activeRemotes.get(outgoingId);
    if (!outgoing) throw new Error(`Active remote ${outgoingId} not found`);
    if (newRole) {
      if (!VALID_ROLES.has(newRole) || newRole === 'spare') {
        throw new Error('newRole must be one of: left, right, chief');
      }
      incoming.role = newRole;
    }
    this.deactivateRemote(platformId, outgoingId);
    this.activateRemote(platformId, incomingId);
  }

  // Update the claim so that firmware re-registration goes to the right platform.
  // If the remote is currently active, deactivate it to the pool first.
  transferRemote(remoteId: string, targetPlatformId: string): void {
    this.getPlatform(targetPlatformId);
    for (const [platformId, platform] of this._platforms) {
      if (platform.activeRemotes.has(remoteId)) {
        this.deactivateRemote(platformId, remoteId);
        break;
      }
    }
    this._remoteClaims.set(remoteId, targetPlatformId);
  }

  // Returns all unassigned remotes: physical remotes from the pool (sourcePlatformId: null)
  // plus benched kb-* remotes from each platform (sourcePlatformId set to their platform).
  getPool(): PoolEntry[] {
    const entries: PoolEntry[] = [];
    for (const remote of this.physicalPool.values()) {
      entries.push({ ...remote.serialize(), sourcePlatformId: null });
    }
    for (const platform of this._platforms.values()) {
      for (const remote of platform.inactiveRemotes.values()) {
        entries.push({ ...remote.serialize(), sourcePlatformId: platform.platformId });
      }
    }
    return entries;
  }

  startGlobalBreak(durationSeconds: number): void {
    const startTime = performance.now() / 1000;
    for (const platform of this._platforms.values()) {
      platform.clock.configureBreak(durationSeconds);
      platform.clock.start(startTime);
    }
  }

  serializeAll(): Record<string, PlatformSerialized> {
    const result: Record<string, PlatformSerialized> = {};
    for (const [id, platform] of this._platforms) {
      result[id] = platform.serialize();
    }
    return result;
  }
}
