import { Module } from '@nestjs/common';
import { MeetConfigController } from './meet-config.controller';
import { MeetConfigService } from './meet-config.service';

@Module({
  controllers: [MeetConfigController],
  providers: [MeetConfigService],
})
export class MeetConfigModule {}
