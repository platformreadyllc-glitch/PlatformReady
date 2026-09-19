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
  relayUrl?: string;
}

// The relay's own CouchDB instance (see testConnection()'s comment) - same
// host as relayUrl, always port 5984 regardless of what port (if any)
// relayUrl itself carries.
function relayDatabaseOrigin(relayUrl: string): string {
  const { protocol, hostname } = new URL(relayUrl);
  return `${protocol}//${hostname}:5984`;
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
      relayUrl: dto.relayUrl,
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
    const base = session.relayUrl ?? 'https://liftingcast.com';
    return {
      baseUrl: `${base}/api/meets/${session.meetId}/platforms/${session.lcPlatformId}`,
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

  async notifyNextAttempt(internalPlatformId: string): Promise<void> {
    if (!this.hasSession(internalPlatformId)) {
      console.warn(
        `[LC] no session for ${internalPlatformId} — next attempt skipped`,
      );
      return;
    }
    const { baseUrl, password } = this.getSessionUrl(internalPlatformId);
    console.log(`[LC] POST next_attempt → ${baseUrl}/next_attempt`);
    await this.post(baseUrl, 'next_attempt', { password });
  }

  async notifySetClock(
    internalPlatformId: string,
    durationSeconds: number,
  ): Promise<void> {
    if (!this.hasSession(internalPlatformId)) {
      console.warn(
        `[LC] no session for ${internalPlatformId} — set clock skipped`,
      );
      return;
    }
    const { baseUrl, password } = this.getSessionUrl(internalPlatformId);
    console.log(`[LC] POST clock → ${baseUrl}/clock (${durationSeconds}s)`);
    await this.post(baseUrl, 'clock', {
      clockTimerLength: durationSeconds,
      password,
    });
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

  // ── Meet/platform browse (for MeetSetup import) ─────────────────────────────

  async fetchUpcomingMeets(
    relayUrl?: string,
  ): Promise<Array<{ id: string; name: string; date: string }>> {
    const base = relayUrl ?? 'https://liftingcast.com';
    const res = await firstValueFrom(
      this.http.get<{
        docs: Array<{ _id: string; name: string; date: string }>;
      }>(`${base}/api/meets`),
    );
    const docs = res.data?.docs ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return docs
      .filter((m) => {
        if (!m.date) return false;
        const parts = m.date.split('/').map(Number);
        if (parts.length !== 3) return false;
        const [month, day, year] = parts;
        return new Date(year, month - 1, day) >= today;
      })
      .sort((a, b) => {
        const [am, ad, ay] = a.date.split('/').map(Number);
        const [bm, bd, by] = b.date.split('/').map(Number);
        return (
          new Date(ay, am - 1, ad).getTime() -
          new Date(by, bm - 1, bd).getTime()
        );
      })
      .map((m) => ({ id: m._id, name: m.name, date: m.date }));
  }

  async fetchMeetPlatforms(
    meetId: string,
    relayUrl?: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const base = relayUrl ?? 'https://liftingcast.com';
    const res = await firstValueFrom(
      this.http.get<{ docs: Array<{ _id: string; name: string }> }>(
        `${base}/api/meets/${meetId}/platforms`,
      ),
    );
    const docs = res.data?.docs ?? [];
    return docs
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p._id, name: p.name }));
  }

  async testConnection(
    dto: TestConnectionDto,
  ): Promise<{ success: boolean; platformName?: string; error?: string }> {
    // A relay-configured test authenticates against the local relay's own
    // CouchDB instance instead of the live site - same reasoning as
    // fetchUpcomingMeets()/fetchMeetPlatforms()'s relayUrl, needed to run a
    // meet entirely offline against a meet that only exists locally (never
    // published to liftingcast.com). The relay (liftingcast/
    // liftingcast-local-relay-server on GitHub - see its compose.yml) runs
    // two separate containers: liftingcast-web (port 80 - what relayUrl
    // itself points at; the browsable UI, and where /api/meets/... lives,
    // same as the live site's plain liftingcast.com) and
    // liftingcast-database (port 5984 - the actual CouchDB instance, the
    // live site's couchdb.liftingcast.com equivalent). _session only
    // exists on the database container - confirmed live (a 405 hitting
    // relayUrl's port 80 directly, which has no matching POST route there).
    let sessionUrl: string;
    try {
      sessionUrl = dto.relayUrl
        ? `${relayDatabaseOrigin(dto.relayUrl)}/_session`
        : 'https://couchdb.liftingcast.com/_session';
    } catch {
      // new URL() throws synchronously on a malformed relayUrl (e.g. a bare
      // IP with no scheme, typo'd input) - DTO validation only checks it's
      // a string, not that it parses, so this is a real, reachable path,
      // not defensive-for-its-own-sake.
      return { success: false, error: 'Invalid relay server address' };
    }
    const platformsBase = dto.relayUrl ?? 'https://liftingcast.com';
    try {
      const sessionRes = await firstValueFrom(
        this.http.post(
          sessionUrl,
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
        this.http.get(`${platformsBase}/api/meets/${dto.meetId}/platforms`),
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
