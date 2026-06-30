import { IsString } from 'class-validator';

export class TransferRemoteDto {
  @IsString()
  targetPlatformId: string;
}
