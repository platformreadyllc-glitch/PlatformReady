import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import { SetLightsDto } from './dto/set-lights.dto';
import { TestConnectionDto } from './dto/test-connection.dto';

interface LiftingCastPlatform {
  _id: string;
  name: string;
}

@Injectable()
export class LiftingCastService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

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
