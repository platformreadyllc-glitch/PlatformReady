import { Controller, Post, Body } from '@nestjs/common';
import { LiftingCastService } from './liftingcast.service';
import { SetLightsDto } from './dto/set-lights.dto';
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

  @Post('test-connection')
  testConnection(@Body() dto: TestConnectionDto) {
    return this.liftingCastService.testConnection(dto);
  }
}
