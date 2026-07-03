import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import { SetLightsDto } from './dto/set-lights.dto';
import { StoreSessionDto } from './dto/store-session.dto';
import { TestConnectionDto } from './dto/test-connection.dto';
import { buttonToDecision } from '../platform/models/decisions';
import { Button } from '../platform/models/enums';

interface LiftingCastPlatform {
  _id: string;
  name: string;
}

interface LcSession {
  meetId: string;
  lcPlatformId: string;
  password: string;
}

@Injectable()
export class LiftingCastService {
  private readonly sessions = new Map<string, LcSession>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  // ── Session management ───────────────────────────────────────────────────────

  storeSession(internalPlatformId: string, dto: StoreSessionDto): void {
    this.sessions.set(internalPlatformId, {
      meetId: dto.meetId,
      lcPlatformId: dto.lcPlatformId,
      password: dto.password,
    });
  }

  hasSession(internalPlatformId: string): boolean {
    return this.sessions.has(internalPlatformId);
  }

  listSessions(): Record<string, { meetId: string; lcPlatformId: string }> {
    const result: Record<string, { meetId: string; lcPlatformId: string }> = {};
    for (const [id, s] of this.sessions) {
      result[id] = { meetId: s.meetId, lcPlatformId: s.lcPlatformId };
    }
    return result;
  }

  private getSessionUrl(internalPlatformId: string): {
    baseUrl: string;
    password: string;
  } {
    const session = this.sessions.get(internalPlatformId);
    if (!session) {
      throw new Error(
        `No LiftingCast session configured for platform ${internalPlatformId}`,
      );
    }
    return {
      baseUrl: `https://liftingcast.com/api/meets/${session.meetId}/platforms/${session.lcPlatformId}`,
      password: session.password,
    };
  }

  // ── Internal notify methods (called by PlatformService) ──────────────────────
  // These are fire-and-forget from the caller's perspective — errors are logged
  // but never propagated so LC failures never affect the vote/clock flow.

  // votes: { left, chief, right } → maps chief→head for LC
  async notifyLights(
    internalPlatformId: string,
    votes: Record<string, Button | null>,
  ): Promise<void> {
    if (!this.hasSession(internalPlatformId)) {
      console.warn(
        `[LC] no session for ${internalPlatformId} — lights skipped`,
      );
      return;
    }
    const { baseUrl, password } = this.getSessionUrl(internalPlatformId);
    const body = {
      left: buttonToDecision(votes['left'] as Button),
      head: buttonToDecision(votes['chief'] as Button),
      right: buttonToDecision(votes['right'] as Button),
      password,
    };
    console.log(`[LC] POST lights → ${baseUrl}/lights`);
    await this.post(baseUrl, 'lights', body);
  }

  async notifyClockStart(internalPlatformId: string): Promise<void> {
    if (!this.hasSession(internalPlatformId)) {
      console.warn(
        `[LC] no session for ${internalPlatformId} — clock start skipped`,
      );
      return;
    }
    const { baseUrl, password } = this.getSessionUrl(internalPlatformId);
    console.log(`[LC] POST start_clock → ${baseUrl}/start_clock`);
    await this.post(baseUrl, 'start_clock', { password });
  }

  async notifyClockReset(internalPlatformId: string): Promise<void> {
    if (!this.hasSession(internalPlatformId)) {
      console.warn(
        `[LC] no session for ${internalPlatformId} — clock reset skipped`,
      );
      return;
    }
    const { baseUrl, password } = this.getSessionUrl(internalPlatformId);
    console.log(`[LC] POST reset_clock → ${baseUrl}/reset_clock`);
    await this.post(baseUrl, 'reset_clock', { password });
  }

  // ── Manually-triggered controller methods ────────────────────────────────────
  // These use env vars and are kept for direct/manual use via the controller.

  private get credentials() {
    const meetId = this.config.getOrThrow<string>('LIFTINGCAST_MEET_ID');
    const platformId = this.config.getOrThrow<string>(
      'LIFTINGCAST_PLATFORM_ID',
    );
    const password = this.config.getOrThrow<string>('LIFTINGCAST_PASSWORD');
    return {
      password,
      baseUrl: `https://liftingcast.com/api/meets/${meetId}/platforms/${platformId}`,
    };
  }

  async setLights(dto: SetLightsDto): Promise<void> {
    const { baseUrl, password } = this.credentials;
    await this.post(baseUrl, 'lights', { ...dto, password });
  }

  async nextAttempt(): Promise<void> {
    const { baseUrl, password } = this.credentials;
    await this.post(baseUrl, 'next_attempt', { password });
  }

  async setClock(clockTimerLength: number): Promise<void> {
    const { baseUrl, password } = this.credentials;
    await this.post(baseUrl, 'clock', { clockTimerLength, password });
  }

  async startClock(): Promise<void> {
    const { baseUrl, password } = this.credentials;
    await this.post(baseUrl, 'start_clock', { password });
  }

  async resetClock(): Promise<void> {
    const { baseUrl, password } = this.credentials;
    await this.post(baseUrl, 'reset_clock', { password });
  }

  async testConnection(
    dto: TestConnectionDto,
  ): Promise<{ success: boolean; platformName?: string; error?: string }> {
    try {
      const sessionRes = await firstValueFrom(
        this.http.post(
          'https://couchdb.liftingcast.com/_session',
          `name=${encodeURIComponent(dto.meetId)}&password=${encodeURIComponent(dto.password)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
          },
        ),
      );
      if (!sessionRes.data?.ok) {
        return { success: false, error: 'Invalid meet ID or password' };
      }
    } catch (err: unknown) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      console.error(
        '[testConnection] session error',
        status,
        isAxiosError(err) ? (err.response?.data ?? err.message) : err,
      );
      if (status === 401) {
        return { success: false, error: 'Invalid meet ID or password' };
      }
      const detail = isAxiosError(err) ? (err.code ?? err.message) : 'unknown';
      return {
        success: false,
        error: `Could not reach LiftingCast (status ${status ?? detail})`,
      };
    }

    try {
      const platformsRes = await firstValueFrom(
        this.http.get(
          `https://liftingcast.com/api/meets/${dto.meetId}/platforms`,
        ),
      );
      const platforms: LiftingCastPlatform[] = platformsRes.data?.docs ?? [];
      const matched = platforms.find((p) => p._id === dto.platformId);
      if (!matched) {
        return { success: false, error: 'Platform ID not found in this meet' };
      }
      return { success: true, platformName: matched.name };
    } catch (err: unknown) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      console.error(
        '[testConnection] platforms error',
        status,
        isAxiosError(err) ? (err.response?.data ?? err.message) : err,
      );
      return { success: false, error: 'Could not fetch platform list' };
    }
  }

  private async post(
    baseUrl: string,
    endpoint: string,
    body: object,
  ): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${baseUrl}/${endpoint}`, body));
    } catch (e) {
      throw new InternalServerErrorException(
        `LiftingCast API error on ${endpoint}: ${(e as Error).message}`,
      );
    }
  }
}
