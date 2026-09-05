import { IsIn, IsString, IsOptional, IsBoolean } from 'class-validator';
import { HardwareType, VALID_HARDWARE_TYPES } from '../models/enums';

export class RegisterPhysicalRemoteDto {
  @IsString()
  remoteId: string;

  @IsIn(Array.from(VALID_HARDWARE_TYPES))
  hardwareType: HardwareType;

  @IsOptional()
  @IsBoolean()
  hasVibration?: boolean;

  @IsOptional()
  @IsBoolean()
  hasDisplay?: boolean;
}
