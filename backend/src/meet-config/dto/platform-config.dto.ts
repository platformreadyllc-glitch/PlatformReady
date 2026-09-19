import { IsBoolean, IsInt, IsString, Min } from 'class-validator';

export class PlatformConfigDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  sessionCount!: number;

  @IsString()
  liftingCastPlatformId!: string;

  @IsBoolean()
  active!: boolean;
}
