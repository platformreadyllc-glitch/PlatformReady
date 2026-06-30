import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { RegisterRemoteDto } from './dto/register-remote.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ReplaceRemoteDto } from './dto/replace-remote.dto';
import { StartGlobalBreakDto } from './dto/start-global-break.dto';
import { EnsurePlatformDto } from './dto/ensure-platform.dto';

@Controller('platforms')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  listPlatforms() {
    return this.platformService.listPlatforms();
  }

  // Must be declared before /:id routes to avoid "ensure" being matched as an id
  @Post('ensure')
  ensurePlatform(@Body() dto: EnsurePlatformDto) {
    return this.platformService.ensurePlatform(dto);
  }

  @Post('break')
  startGlobalBreak(@Body() dto: StartGlobalBreakDto) {
    return this.platformService.startGlobalBreak(dto.durationSeconds);
  }

  @Post()
  createPlatform(@Body() dto: CreatePlatformDto) {
    return this.platformService.createPlatform(dto).serialize();
  }

  // Must be declared before @Get(':id') so 'break' isn't matched as an id
  @Get('break')
  getGlobalBreak() {
    return this.platformService.getGlobalBreak();
  }

  @Get(':id')
  getPlatform(@Param('id') id: string) {
    return this.platformService.getPlatform(id).serialize();
  }

  // Must be declared before @Delete(':id') so 'break' isn't matched as an id
  @Delete('break')
  cancelGlobalBreak() {
    return this.platformService.cancelGlobalBreak();
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
  pressClockButton(
    @Param('id') id: string,
    @Body() body: { remoteId: string },
  ) {
    return this.platformService.pressClockButton(id, body.remoteId);
  }

  @Post(':id/remotes/replace')
  replaceRemote(@Param('id') id: string, @Body() dto: ReplaceRemoteDto) {
    return this.platformService.replaceRemote(id, dto);
  }

  @Post(':id/reset')
  resetAttempt(@Param('id') id: string) {
    return this.platformService.resetAttempt(id);
  }

  @Post(':id/attempt-change')
  toggleAttemptChange(@Param('id') id: string) {
    return this.platformService.toggleAttemptChange(id);
  }

  @Post(':id/break')
  startPlatformBreak(
    @Param('id') id: string,
    @Body() dto: StartGlobalBreakDto,
  ) {
    return this.platformService.startPlatformBreak(id, dto.durationSeconds);
  }

  @Delete(':id/break')
  cancelPlatformBreak(@Param('id') id: string) {
    return this.platformService.cancelPlatformBreak(id);
  }
}
