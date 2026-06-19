import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlatformManager } from './models/platform-manager';
import { Platform } from './models/platform';
import { Button, Role } from './models/enums';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { RegisterRemoteDto } from './dto/register-remote.dto';
import { EnsurePlatformDto } from './dto/ensure-platform.dto';
import { PlatformGateway } from './platform.gateway';

@Injectable()
export class PlatformService {
  private readonly manager = new PlatformManager();

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
      const platform = new Platform({ platformId: dto.platformId, name: dto.name });
      this.manager.addPlatform(platform);
      platform.registerRemote('kb-left', 'left' as Role);
      platform.registerRemote('kb-chief', 'chief' as Role);
      platform.registerRemote('kb-right', 'right' as Role);
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
    const platform = this.getPlatform(platformId);
    platform.resetVotes();
    platform.clock.resetToActive();
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

  startGlobalBreak(durationSeconds: number) {
    try {
      this.manager.startGlobalBreak(durationSeconds);
      const all = this.manager.serializeAll();
      this.gateway.emitGlobalUpdate(all);
      return all;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
