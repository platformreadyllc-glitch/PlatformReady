import { IsArray, IsInt, Min } from 'class-validator';

// Deliberately not password-gated, unlike SaveMeetConfigDto - "which day of
// a multi-day meet is currently running" is operational state changed from
// the (open, ungated) Meet Director View while the meet is live, not part
// of the setup form itself. See MeetConfigService's comment.
export class ActiveDayDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsArray()
  @IsInt({ each: true })
  completedIndices!: number[];
}
