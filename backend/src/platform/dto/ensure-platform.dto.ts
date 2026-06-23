import { IsString, IsOptional } from 'class-validator';

export class EnsurePlatformDto {
  @IsString()
  platformId: string;

  @IsOptional()
  @IsString()
  name?: string;
}
