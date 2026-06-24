import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlatformManager } from './models/platform-manager';
import { Platform } from './models/platform';
import { Button, Role, ClockMode } from './models/enums';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { RegisterRemoteDto } from './dto/register-remote.dto';
import { EnsurePlatformDto } from './dto/ensure-platform.dto';
import { PlatformGateway } from './platform.gateway';

@Injectable()
export class PlatformService {
  private readonly manager = new PlatformManager();
  private readonly breakTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly voteResetTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private globalBreak: { startedAt: number; duration: number } | null = null;

  constructor(private readonly gateway: PlatformGateway) {}

  createPlatform(dto: CreatePlatformDto): Platform {
    try {
      const platform = new Platform({
        platformId: dto.platformId,
        name: dto.name,
        decisionDelay: dto.decisionDelay,
      });
      this.manager.addPlatform(platform);
      return platform;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  ensurePlatform(dto: EnsurePlatformDto) {
    if (this.manager.hasPlatform(dto.platformId)) {
      return this.manager.getPlatform(dto.platformId).serialize();
    }
    try {
      const platform = new Platform({
        platformId: dto.platformId,
        name: dto.name,
      });
      this.manager.addPlatform(platform);
      platform.registerRemote('kb-left', 'left' as Role);
      platform.registerRemote('kb-chief', 'chief' as Role);
      platform.registerRemote('kb-right', 'right' as Role);

      // If a global break is in progress, sync this platform into it so it
      // can't accept votes while all other platforms are locked.
      // Per-platform breaks are intentionally NOT inherited here.
      if (this.globalBreak) {
        const elapsed = performance.now() / 1000 - this.globalBreak.startedAt;
        const remaining = Math.max(0, this.globalBreak.duration - elapsed);
        if (remaining > 0) {
          platform.clock.configureBreak(remaining);
          platform.clock.start();
          this.scheduleBreakReset(dto.platformId, remaining);
        } else {
          this.globalBreak = null;
        }
      }

      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  getPlatform(platformId: string): Platform {
    try {
      return this.manager.getPlatform(platformId);
    } catch {
      throw new NotFoundException(`Platform ${platformId} not found`);
    }
  }

  deletePlatform(platformId: string): void {
    try {
      this.manager.removePlatform(platformId);
    } catch {
      throw new NotFoundException(`Platform ${platformId} not found`);
    }
  }

  listPlatforms() {
    return this.manager.serializeAll();
  }

  registerRemote(platformId: string, dto: RegisterRemoteDto) {
    const platform = this.getPlatform(platformId);
    try {
      const remote = platform.registerRemote(dto.remoteId, dto.role as Role, {
        isSpare: dto.isSpare,
        hasVibration: dto.hasVibration,
        hasDisplay: dto.hasDisplay,
        active: dto.active,
      });
      return remote.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  castVote(platformId: string, remoteId: string, button: Button) {
    const platform = this.getPlatform(platformId);
    try {
      platform.castVote(remoteId, button);
      const outcome = platform.tryDetermineOutcome();
      this.gateway.emitPlatformUpdate(platformId, platform.serialize());
      // Schedule a server-side auto-reset so votes are never permanently stuck if all
      // frontend tabs for this platform happen to be backgrounded during the reveal.
      if (platform.hasCompleteVoteSet()) {
        this.scheduleVoteReset(platformId, platform.decisionDelay + 6);
      }
      return { votes: platform.getRefereeVotes(), outcome: outcome ?? null };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  pressClockButton(platformId: string, remoteId: string) {
    const platform = this.getPlatform(platformId);
    try {
      platform.handleClockButton(remoteId);
      this.gateway.emitPlatformUpdate(platformId, platform.serialize());
      return platform.clock.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  resetAttempt(platformId: string) {
    this.cancelVoteReset(platformId);
    const platform = this.getPlatform(platformId);
    platform.resetVotes();
    if (platform.clock.mode !== ClockMode.BREAK) {
      platform.clock.resetToActive();
    }
    this.gateway.emitPlatformUpdate(platformId, platform.serialize());
    return platform.serialize();
  }

  private scheduleVoteReset(platformId: string, delaySeconds: number) {
    this.cancelVoteReset(platformId);
    const timer = setTimeout(() => {
      this.voteResetTimers.delete(platformId);
      if (!this.manager.hasPlatform(platformId)) return;
      const platform = this.manager.getPlatform(platformId);
      if (!platform.hasCompleteVoteSet()) return;
      platform.resetVotes();
      if (platform.clock.mode !== ClockMode.BREAK) {
        platform.clock.resetToActive();
      }
      this.gateway.emitPlatformUpdate(platformId, platform.serialize());
    }, delaySeconds * 1000);
    this.voteResetTimers.set(platformId, timer);
  }

  private cancelVoteReset(platformId: string) {
    const timer = this.voteResetTimers.get(platformId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.voteResetTimers.delete(platformId);
    }
  }

  toggleAttemptChange(platformId: string) {
    const platform = this.getPlatform(platformId);
    platform.toggleAttemptChange();
    this.gateway.emitPlatformUpdate(platformId, platform.serialize());
    return platform.serialize();
  }

  substituteSpare(platformId: string, targetRole: Role) {
    const platform = this.getPlatform(platformId);
    try {
      platform.substituteSpare(targetRole);
      this.gateway.emitPlatformUpdate(platformId, platform.serialize());
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  startPlatformBreak(platformId: string, durationSeconds: number) {
    const platform = this.getPlatform(platformId);
    try {
      platform.clock.configureBreak(durationSeconds);
      platform.clock.start();
      this.gateway.emitPlatformUpdate(platformId, platform.serialize());
      this.scheduleBreakReset(platformId, durationSeconds);
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  startGlobalBreak(durationSeconds: number) {
    try {
      this.globalBreak = {
        startedAt: performance.now() / 1000,
        duration: durationSeconds,
      };
      this.manager.startGlobalBreak(durationSeconds);
      const all = this.manager.serializeAll();
      this.gateway.emitGlobalUpdate(all);
      for (const platform of this.manager.listPlatforms()) {
        this.scheduleBreakReset(platform.platformId, durationSeconds);
      }
      return all;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  private scheduleBreakReset(platformId: string, durationSeconds: number) {
    if (this.breakTimers.has(platformId)) {
      clearTimeout(this.breakTimers.get(platformId)!);
    }
    const timer = setTimeout(() => {
      this.breakTimers.delete(platformId);
      if (!this.manager.hasPlatform(platformId)) return;
      const platform = this.manager.getPlatform(platformId);
      if (platform.clock.mode === ClockMode.BREAK) {
        platform.clock.resetToActive();
        this.gateway.emitPlatformUpdate(platformId, platform.serialize());
      }
    }, durationSeconds * 1000);
    this.breakTimers.set(platformId, timer);
  }
}
