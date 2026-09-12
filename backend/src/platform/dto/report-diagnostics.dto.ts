import { IsNumber, IsOptional, IsBoolean } from 'class-validator';

// Temporary debugging tool for the WS-over-Ethernet "connects once, then
// stuck disconnected forever" bug - reported over REST (which keeps working
// even while the WS connection is stuck), on a periodic timer independent
// of WS state, specifically so this is observable *during* a stuck period
// rather than only at the last successful WS connect. Remove once that bug
// is confirmed fixed and this stops earning its keep.
export class ReportDiagnosticsDto {
  @IsOptional()
  @IsNumber()
  freeHeap?: number;

  @IsOptional()
  @IsNumber()
  uptimeMs?: number;

  // The device's own belief about whether its WS connection is up right
  // now - compared against the backend's own `connected` (driven by the WS
  // gateway's heartbeat) to tell client-side-stuck apart from a real
  // network black hole.
  @IsOptional()
  @IsBoolean()
  wsConnectedLocally?: boolean;
}
