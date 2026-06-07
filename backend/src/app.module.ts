import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlatformModule } from './platform/platform.module';
import { LiftingCastModule } from './liftingcast/liftingcast.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PlatformModule,
    LiftingCastModule,
  ],
})
export class AppModule {}
