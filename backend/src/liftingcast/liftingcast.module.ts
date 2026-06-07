import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LiftingCastController } from './liftingcast.controller';
import { LiftingCastService } from './liftingcast.service';

@Module({
  imports: [HttpModule],
  controllers: [LiftingCastController],
  providers: [LiftingCastService],
  exports: [LiftingCastService],
})
export class LiftingCastModule {}
