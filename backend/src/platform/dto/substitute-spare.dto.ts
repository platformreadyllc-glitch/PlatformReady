import { IsString } from 'class-validator';
import { Role } from '../models/enums';

export class SubstituteSpareDto {
  @IsString()
  targetRole: Role;
}
