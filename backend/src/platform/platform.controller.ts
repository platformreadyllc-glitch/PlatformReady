import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { RegisterRemoteDto } from './dto/register-remote.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { SubstituteSpareDto } from './dto/substitute-spare.dto';
import { StartGlobalBreakDto } from './dto/start-global-break.dto';

@Controller('platforms')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  listPlatforms() {
    return this.platformService.listPlatforms();
  }

  @Post()
  createPlatform(@Body() dto: CreatePlatformDto) {
    return this.platformService.createPlatform(dto).serialize();
  }

  @Get(':id')
  getPlatform(@Param('id') id: string) {
    return this.platformService.getPlatform(id).serialize();
  }

  @Delete(':id')
  deletePlatform(@Param('id') id: string) {
    this.platformService.deletePlatform(id);
  }

  @Post(':id/remotes')
  registerRemote(@Param('id') id: string, @Body() dto: RegisterRemoteDto) {
    return this.platformService.registerRemote(id, dto);
  }

  @Post(':id/vote')
  castVote(@Param('id') id: string, @Body() dto: CastVoteDto) {
    return this.platformService.castVote(id, dto.remoteId, dto.button);
  }

  @Post(':id/clock')
  pressClockButton(@Param('id') id: string, @Body() body: { remoteId: string }) {
    return this.platformService.pressClockButton(id, body.remoteId);
  }

  @Post(':id/substitute')
  substituteSpare(@Param('id') id: string, @Body() dto: SubstituteSpareDto) {
    return this.platformService.substituteSpare(id, dto.targetRole);
  }

  @Post('break')
  startGlobalBreak(@Body() dto: StartGlobalBreakDto) {
    return this.platformService.startGlobalBreak(dto.durationSeconds);
  }
}
