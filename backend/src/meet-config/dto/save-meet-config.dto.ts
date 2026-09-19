import {
  IsBoolean,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DayConfigDto } from './day-config.dto';

// Mirrors the frontend's MeetConfig shape (frontend/src/pages/MeetSetup.tsx)
// as closely as possible - this is the full, password-gated meet
// configuration (see MeetConfigService), distinct from the public,
// secret-free MeetConfigSummary derived from it.
export class SaveMeetConfigDto {
  @IsString()
  name!: string;

  @IsString()
  startDate!: string;

  @IsInt()
  @Min(1)
  numDays!: number;

  @IsInt()
  @Min(1)
  numPlatforms!: number;

  @IsString()
  liftingCastPassword!: string;

  @IsBoolean()
  perDayPasswords!: boolean;

  @ValidateNested({ each: true })
  @Type(() => DayConfigDto)
  days!: DayConfigDto[];
}
