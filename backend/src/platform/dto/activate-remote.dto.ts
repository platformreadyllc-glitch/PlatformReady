import { IsIn, IsOptional } from 'class-validator';
import { Role, VALID_ROLES } from '../models/enums';

export class ActivateRemoteDto {
  @IsOptional()
  @IsIn(Array.from(VALID_ROLES))
  role?: Role;
}
