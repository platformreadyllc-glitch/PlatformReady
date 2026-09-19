import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SaveMeetConfigDto } from './dto/save-meet-config.dto';
import { ActiveDayDto } from './dto/active-day.dto';

export interface MeetConfigSummaryPlatform {
  name: string;
  active: boolean;
}

// Public, secret-free view of the meet config - no LiftingCast
// meetId/password anywhere in it. This is what every page other than Meet
// Setup itself reads (App.tsx's nav, RemoteManagement's platform sync,
// PlatformView/DirectorView's own display), so it's deliberately safe to
// expose with no auth - the same shape any of those pages could already see
// just by looking at the screen on the host computer.
export interface MeetConfigSummary {
  name: string;
  startDate: string;
  days: Array<{ platforms: MeetConfigSummaryPlatform[] }>;
  activeDayIndex: number;
  completedDayIndices: number[];
}

// In-memory, like the rest of this app's state (PlatformManager,
// LiftingCastService's sessions) - wiped on backend restart, same known
// limitation already flagged for the LiftingCast session work.
@Injectable()
export class MeetConfigService {
  private config: SaveMeetConfigDto | null = null;
  // Set (not compared as a hash) deliberately - this app has no other
  // secret-hashing anywhere, everything else (remote config, LC passwords)
  // is already plaintext-in-memory on this same trust boundary (your own
  // LAN during a meet). Bootstrapped by the first unlock() call rather
  // than requiring a separate "set a password" step - see unlock()'s
  // comment.
  private adminPassword: string | null = null;
  private readonly validTokens = new Set<string>();
  private activeDay: ActiveDayDto = { index: 0, completedIndices: [] };

  getSummary(): MeetConfigSummary | null {
    if (!this.config) return null;
    return {
      name: this.config.name,
      startDate: this.config.startDate,
      days: this.config.days.map((d) => ({
        platforms: d.platforms.map((p) => ({
          name: p.name,
          active: p.active,
        })),
      })),
      activeDayIndex: this.activeDay.index,
      completedDayIndices: this.activeDay.completedIndices,
    };
  }

  // The single entry point into the password-gated side of this service -
  // deliberately does double duty as both "set the password" (the first
  // time it's ever called, before any password exists) and "check the
  // password" (every time after) rather than requiring a separate sign-up
  // step: this app has no accounts system anywhere else, and a meet's
  // whole lifecycle already starts from nothing via this same page.
  unlock(password: string): string {
    if (this.adminPassword === null) {
      this.adminPassword = password;
    } else if (this.adminPassword !== password) {
      throw new UnauthorizedException('Incorrect password');
    }
    const token = randomUUID();
    this.validTokens.add(token);
    return token;
  }

  private requireToken(token: string | undefined): void {
    if (!token || !this.validTokens.has(token)) {
      throw new UnauthorizedException('Unlock the meet setup page first');
    }
  }

  // Full config including LiftingCast credentials - deliberately NOT
  // token-gated, unlike save() below. Director View's "Start Day" needs
  // the real per-day LC password to re-authenticate that day's platforms,
  // and it's meant to work from any computer, unlocked or not - only
  // *changing* meet setup needs the password, not reading it (same as
  // Meet Setup's own pre-fill on load). Null before the first save,
  // letting callers fall back to their own empty-form default.
  getFull(): SaveMeetConfigDto | null {
    return this.config;
  }

  save(token: string | undefined, dto: SaveMeetConfigDto): void {
    this.requireToken(token);
    this.config = dto;
  }

  getActiveDay(): ActiveDayDto {
    return this.activeDay;
  }

  setActiveDay(dto: ActiveDayDto): void {
    this.activeDay = dto;
  }
}
