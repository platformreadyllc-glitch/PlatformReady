import { Platform, PlatformSerialized } from './platform';

export class PlatformManager {
  private _platforms: Map<string, Platform> = new Map();
  // Explicit assignment overrides for re-registration after reboot.
  // Only set by transferRemote; never auto-set on initial registration.
  private _remoteClaims: Map<string, string> = new Map();

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

  transferRemote(remoteId: string, targetPlatformId: string): void {
    const target = this.getPlatform(targetPlatformId);
    const current = this.findRemotePlatform(remoteId);
    if (!current) {
      throw new Error(`Remote ${remoteId} not found on any platform`);
    }
    if (current.platformId === targetPlatformId) {
      throw new Error(`Remote ${remoteId} is already on platform ${targetPlatformId}`);
    }
    const remote = current.removeRemote(remoteId);
    target.addRemote(remote);
    this._remoteClaims.set(remoteId, targetPlatformId);
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
