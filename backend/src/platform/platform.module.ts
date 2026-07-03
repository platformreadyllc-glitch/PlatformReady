import { Module } from '@nestjs/common';
import { LiftingCastModule } from '../liftingcast/liftingcast.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGateway } from './platform.gateway';

@Module({
  imports: [LiftingCastModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformGateway],
  exports: [PlatformService, PlatformGateway],
})
export class PlatformModule {}
