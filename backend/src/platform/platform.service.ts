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

@Injectable()
export class PlatformService {
  private readonly manager = new PlatformManager();

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
      return { votes: platform.getRefereeVotes(), outcome: outcome ?? null };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  pressClockButton(platformId: string, remoteId: string) {
    const platform = this.getPlatform(platformId);
    try {
      platform.handleClockButton(remoteId);
      return platform.clock.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  substituteSpare(platformId: string, targetRole: Role) {
    const platform = this.getPlatform(platformId);
    try {
      platform.substituteSpare(targetRole);
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  startGlobalBreak(durationSeconds: number) {
    try {
      this.manager.startGlobalBreak(durationSeconds);
      return this.manager.serializeAll();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
