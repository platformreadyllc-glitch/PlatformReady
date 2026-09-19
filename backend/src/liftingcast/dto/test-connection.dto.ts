import { IsString, IsOptional } from 'class-validator';

export class TestConnectionDto {
  @IsString()
  meetId!: string;

  @IsString()
  platformId!: string;

  @IsString()
  password!: string;

  // Base URL of a local LiftingCast relay server (e.g. "http://192.168.1.50")
  // to test against instead of the live liftingcast.com/couchdb.liftingcast.com -
  // for running a meet entirely offline against an unpublished local meet. See
  // LiftingCastService.testConnection()/getSessionUrl() for where this is used.
  @IsOptional()
  @IsString()
  relayUrl?: string;
}
