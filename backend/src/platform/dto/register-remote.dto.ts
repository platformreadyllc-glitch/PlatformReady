import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { Role } from '../models/enums';

export class RegisterRemoteDto {
  @IsString()
  remoteId: string;

  @IsString()
  role: Role;

  @IsOptional()
  @IsBoolean()
  isSpare?: boolean;

  @IsOptional()
  @IsBoolean()
  hasVibration?: boolean;

  @IsOptional()
  @IsBoolean()
  hasDisplay?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
