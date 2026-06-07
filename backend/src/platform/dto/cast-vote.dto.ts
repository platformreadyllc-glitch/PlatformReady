import { IsString } from 'class-validator';
import { Button } from '../models/enums';

export class CastVoteDto {
  @IsString()
  remoteId: string;

  @IsString()
  button: Button;
}
