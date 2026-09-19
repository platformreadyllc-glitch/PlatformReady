import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PlatformConfigDto } from './platform-config.dto';

export class DayConfigDto {
  @IsString()
  liftingCastMeetId!: string;

  @IsString()
  liftingCastPassword!: string;

  @ValidateNested({ each: true })
  @Type(() => PlatformConfigDto)
  platforms!: PlatformConfigDto[];
}
