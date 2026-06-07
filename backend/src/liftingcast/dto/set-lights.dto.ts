import { IsBoolean, IsNumber, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CardSetDto {
  @IsBoolean()
  red: boolean;

  @IsBoolean()
  blue: boolean;

  @IsBoolean()
  yellow: boolean;
}

class RefereeDecisionDto {
  @IsObject()
  decision: 'good' | 'bad';

  @ValidateNested()
  @Type(() => CardSetDto)
  cards: CardSetDto;
}

export class SetLightsDto {
  @ValidateNested()
  @Type(() => RefereeDecisionDto)
  left: RefereeDecisionDto;

  @ValidateNested()
  @Type(() => RefereeDecisionDto)
  head: RefereeDecisionDto;

  @ValidateNested()
  @Type(() => RefereeDecisionDto)
  right: RefereeDecisionDto;

  @IsOptional()
  @IsBoolean()
  selectNextAttempt?: boolean;

  @IsOptional()
  @IsNumber()
  selectNextAttemptDelay?: number;

  @IsOptional()
  @IsNumber()
  clearLightsDelay?: number;
}
