import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { LiftingCastService } from './liftingcast.service';
import { SetLightsDto } from './dto/set-lights.dto';
import { StoreSessionDto } from './dto/store-session.dto';
import { TestConnectionDto } from './dto/test-connection.dto';

@Controller('liftingcast')
export class LiftingCastController {
  constructor(private readonly liftingCastService: LiftingCastService) {}

  @Post('lights')
  setLights(@Body() dto: SetLightsDto) {
    return this.liftingCastService.setLights(dto);
  }

  @Post('next-attempt')
  nextAttempt() {
    return this.liftingCastService.nextAttempt();
  }

  @Post('clock')
  setClock(@Body() body: { clockTimerLength: number }) {
    return this.liftingCastService.setClock(body.clockTimerLength);
  }

  @Post('start-clock')
  startClock() {
    return this.liftingCastService.startClock();
  }

  @Post('reset-clock')
  resetClock() {
    return this.liftingCastService.resetClock();
  }

  @Get('sessions')
  listSessions() {
    return this.liftingCastService.listSessions();
  }

  @Post('session/:platformId')
  storeSession(
    @Param('platformId') platformId: string,
    @Body() dto: StoreSessionDto,
  ) {
    console.log(`[LC] storeSession called for ${platformId}`, {
      meetId: dto.meetId,
      lcPlatformId: dto.lcPlatformId,
      hasPassword: !!dto.password,
    });
    this.liftingCastService.storeSession(platformId, dto);
    console.log(`[LC] session stored for ${platformId}`);
    return { ok: true };
  }

  @Get('browse/meets')
  browseMeets(@Query('relayUrl') relayUrl?: string) {
    return this.liftingCastService.fetchUpcomingMeets(relayUrl);
  }

  @Get('browse/meets/:meetId/platforms')
  browsePlatforms(
    @Param('meetId') meetId: string,
    @Query('relayUrl') relayUrl?: string,
  ) {
    return this.liftingCastService.fetchMeetPlatforms(meetId, relayUrl);
  }

  @Post('test-connection')
  testConnection(@Body() dto: TestConnectionDto) {
    return this.liftingCastService.testConnection(dto);
  }
}
