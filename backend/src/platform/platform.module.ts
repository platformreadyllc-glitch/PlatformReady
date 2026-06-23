import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGateway } from './platform.gateway';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, PlatformGateway],
  exports: [PlatformService, PlatformGateway],
})
export class PlatformModule {}
