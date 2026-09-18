import { IsString, IsOptional } from 'class-validator';

// TEMPORARY - see conn-log.ts. One-shot event report from the firmware
// (ws_network_client.cpp) for a raw WS connect attempt or teardown -
// unlike ReportDiagnosticsDto's periodic snapshot, this fires around every
// individual attempt so the log can see ones that never reach a full WS
// handshake (invisible to esp-remotes.gateway.ts otherwise). Remove once
// the root cause of the Ethernet WS instability is found.
export class ReportEventDto {
  @IsString()
  tag!: string;

  @IsOptional()
  @IsString()
  detail?: string;
}
