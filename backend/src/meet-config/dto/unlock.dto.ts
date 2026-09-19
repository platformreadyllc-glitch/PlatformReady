import { IsString, MinLength } from 'class-validator';

export class UnlockDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
