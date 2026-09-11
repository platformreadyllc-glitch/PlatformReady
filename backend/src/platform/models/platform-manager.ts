import { Platform, PlatformSerialized } from './platform';
import { Remote, RemoteSerialized } from './remote';
import { Role, VALID_ROLES, HardwareType } from './enums';
import { isHardwareTypeCompatible } from './hardware-compat';

export interface PoolEntry extends RemoteSerialized {
  sourcePlatformId: string | null;
}

export class PlatformManager {
  private _platforms: Map<string, Platform> = new Map();
  // Physical remotes that are not currently active on any platform.
  readonly physicalPool: Map<string, Remote> = new Map();

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

  // Finds a remote wherever it currently lives: the unassigned pool, or
  // active/inactive on any platform. Used by EspRemotesGateway to validate
  // an incoming WS connection's claimed remoteId.
  findRemote(remoteId: string): Remote | undefined {
    const pooled = this.physicalPool.get(remoteId);
    if (pooled) return pooled;
    for (const platform of this._platforms.values()) {
      if (platform.hasRemote(remoteId)) return platform.getRemote(remoteId);
    }
    return undefined;
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

  // Register a new physical remote into the unassigned pool with a
  // hardware-type classification (side/chief) but no platform/role
  // assignment yet — that happens later via activateRemote(). Distinct
  // from registerPhysical() (used by the older, platform-scoped
  // registration route still used by not-yet-reflashed devices) so that
  // path's behavior stays untouched.
  // Idempotent: returns the existing remote if already registered.
  registerPool(
    remoteId: string,
    hardwareType: HardwareType,
    options: { hasVibration?: boolean; hasDisplay?: boolean } = {},
  ): Remote {
    const poolEntry = this.physicalPool.get(remoteId);
    if (poolEntry) {
      // Refresh self-reported capabilities even for an already-pooled
      // remote — see the equivalent comment in
      // PlatformService.registerPhysicalRemote.
      poolEntry.hardwareType = hardwareType;
      if (options.hasVibration !== undefined)
        poolEntry.hasVibration = options.hasVibration;
      if (options.hasDisplay !== undefined)
        poolEntry.hasDisplay = options.hasDisplay;
      return poolEntry;
    }
    for (const p of this._platforms.values()) {
      const active = p.activeRemotes.get(remoteId);
      if (active) return active;
    }
    const remote = new Remote({
      remoteId,
      role: 'spare',
      platformId: null,
      hardwareType,
      ...options,
    });
    this.physicalPool.set(remoteId, remote);
    return remote;
  }

  // Activate a remote onto a platform's active slot.
  // kb-* remotes come from the platform's own inactiveRemotes.
  // Physical remotes come from physicalPool. `role` sets/overrides the
  // remote's role at activation time (needed since physical remotes may
  // register with no specific role, e.g. 'spare'); if omitted, the
  // remote's existing role is used instead.
  activateRemote(platformId: string, remoteId: string, role?: Role): void {
    const platform = this.getPlatform(platformId);
    if (this.isKb(remoteId)) {
      platform.activateRemote(remoteId);
      return;
    }

    const remote = this.physicalPool.get(remoteId);
    if (!remote) throw new Error(`Remote ${remoteId} not found in pool`);
    if (platform.activeRemotes.size >= 3) {
      throw new Error('Cannot have more than 3 active remotes');
    }

    const effectiveRole = role ?? remote.role;
    if (!VALID_ROLES.has(effectiveRole) || effectiveRole === 'spare') {
      throw new Error('role must be one of: left, right, chief');
    }
    if (!isHardwareTypeCompatible(remote.hardwareType, effectiveRole)) {
      throw new Error(
        `Remote ${remoteId} (${remote.hardwareType ?? 'unknown'} hardware) cannot be assigned role ${effectiveRole}`,
      );
    }
    for (const active of platform.activeRemotes.values()) {
      if (active.role === effectiveRole) {
        throw new Error(
          `Platform ${platformId} already has a remote with role ${effectiveRole}`,
        );
      }
    }

    remote.role = effectiveRole;
    this.physicalPool.delete(remoteId);
    remote.platformId = platformId;
    platform.activeRemotes.set(remoteId, remote);
  }

  // Deactivate a remote from a platform.
  // kb-* remotes return to the platform's inactiveRemotes.
  // Physical remotes return to physicalPool.
  deactivateRemote(platformId: string, remoteId: string): void {
    const platform = this.getPlatform(platformId);
    const remote = platform.activeRemotes.get(remoteId);
    if (!remote) {
      throw new Error(
        `Active remote ${remoteId} not found on platform ${platformId}`,
      );
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
      if (
        !isIncomingKb &&
        !isHardwareTypeCompatible(incoming.hardwareType, newRole)
      ) {
        throw new Error(
          `Remote ${incomingId} (${incoming.hardwareType ?? 'unknown'} hardware) cannot be assigned role ${newRole}`,
        );
      }
      incoming.role = newRole;
    }
    this.deactivateRemote(platformId, outgoingId);
    this.activateRemote(platformId, incomingId);
  }

  // If the remote is currently active on a platform, deactivate it to the
  // pool first, freeing it up to be activated on targetPlatformId instead.
  transferRemote(remoteId: string, targetPlatformId: string): void {
    this.getPlatform(targetPlatformId);
    for (const [platformId, platform] of this._platforms) {
      if (platform.activeRemotes.has(remoteId)) {
        this.deactivateRemote(platformId, remoteId);
        break;
      }
    }
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
        entries.push({
          ...remote.serialize(),
          sourcePlatformId: platform.platformId,
        });
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
