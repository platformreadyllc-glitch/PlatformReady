import { IsString, IsOptional } from 'class-validator';

export class StoreSessionDto {
  @IsString()
  meetId: string;

  @IsString()
  lcPlatformId: string;

  @IsString()
  password: string;

  // See TestConnectionDto's relayUrl - persisted with the session so every
  // later live push (lights/clock/next_attempt, via getSessionUrl()) also
  // goes to the relay instead of the live site.
  @IsOptional()
  @IsString()
  relayUrl?: string;
}
