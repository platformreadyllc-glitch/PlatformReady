import { IsNumber, Min } from 'class-validator';

export class StartGlobalBreakDto {
  @IsNumber()
  @Min(1)
  durationSeconds: number;
}
