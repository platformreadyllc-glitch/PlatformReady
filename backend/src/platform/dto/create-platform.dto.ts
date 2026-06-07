import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class CreatePlatformDto {
  @IsString()
  platformId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  decisionDelay?: number;
}
