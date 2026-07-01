import { IsString, IsOptional } from 'class-validator';

export class ReplaceRemoteDto {
  @IsString()
  incomingRemoteId: string;

  @IsString()
  outgoingRemoteId: string;

  @IsOptional()
  @IsString()
  newRole?: string;
}
