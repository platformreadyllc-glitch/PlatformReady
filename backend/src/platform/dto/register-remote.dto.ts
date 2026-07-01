import { IsIn, IsString, IsOptional, IsBoolean } from 'class-validator';
import { Role, VALID_ROLES } from '../models/enums';

export class RegisterRemoteDto {
  @IsString()
  remoteId: string;

  @IsIn(Array.from(VALID_ROLES))
  role: Role;

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
