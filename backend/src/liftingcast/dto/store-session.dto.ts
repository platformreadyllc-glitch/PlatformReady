import { IsString } from 'class-validator';

export class StoreSessionDto {
  @IsString()
  meetId: string;

  @IsString()
  lcPlatformId: string;

  @IsString()
  password: string;
}
