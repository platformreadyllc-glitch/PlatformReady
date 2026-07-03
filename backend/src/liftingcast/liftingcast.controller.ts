import { Controller, Post, Body, Param } from '@nestjs/common';
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

  @Post('session/:platformId')
  storeSession(
    @Param('platformId') platformId: string,
    @Body() dto: StoreSessionDto,
  ) {
    this.liftingCastService.storeSession(platformId, dto);
    return { ok: true };
  }

  @Post('test-connection')
  testConnection(@Body() dto: TestConnectionDto) {
    return this.liftingCastService.testConnection(dto);
  }
}
