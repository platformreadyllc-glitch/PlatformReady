import { IsString } from 'class-validator';

export class TestConnectionDto {
  @IsString()
  meetId!: string;

  @IsString()
  platformId!: string;

  @IsString()
  password!: string;
}
