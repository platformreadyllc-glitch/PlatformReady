import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { MeetConfigService } from './meet-config.service';
import { SaveMeetConfigDto } from './dto/save-meet-config.dto';
import { UnlockDto } from './dto/unlock.dto';
import { ActiveDayDto } from './dto/active-day.dto';

const TOKEN_HEADER = 'x-meet-admin-token';

@Controller('meet-config')
export class MeetConfigController {
  constructor(private readonly meetConfig: MeetConfigService) {}

  // Public - no token. See MeetConfigService.getSummary()'s comment on why
  // this is safe to expose with no auth.
  @Get('summary')
  getSummary() {
    return this.meetConfig.getSummary();
  }

  @Post('unlock')
  unlock(@Body() dto: UnlockDto) {
    return { token: this.meetConfig.unlock(dto.password) };
  }

  // Public - no token. See MeetConfigService.getFull()'s comment.
  @Get()
  getFull() {
    return this.meetConfig.getFull();
  }

  @Post()
  save(@Headers(TOKEN_HEADER) token: string | undefined, @Body() dto: SaveMeetConfigDto) {
    this.meetConfig.save(token, dto);
    return { ok: true };
  }

  // Public - no token. See ActiveDayDto's comment: this is live-meet
  // operational state (Meet Director View), not part of the gated setup
  // form.
  @Get('active-day')
  getActiveDay() {
    return this.meetConfig.getActiveDay();
  }

  @Post('active-day')
  setActiveDay(@Body() dto: ActiveDayDto) {
    this.meetConfig.setActiveDay(dto);
    return { ok: true };
  }
}
