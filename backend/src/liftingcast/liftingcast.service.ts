import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SetLightsDto } from './dto/set-lights.dto';
import { TestConnectionDto } from './dto/test-connection.dto';

@Injectable()
export class LiftingCastService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get credentials() {
    const meetId = this.config.getOrThrow<string>('LIFTINGCAST_MEET_ID');
    const platformId = this.config.getOrThrow<string>('LIFTINGCAST_PLATFORM_ID');
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

  async testConnection(dto: TestConnectionDto): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionRes = await firstValueFrom(
        this.http.post(
          'https://couchdb.liftingcast.com/_session',
          `name=${encodeURIComponent(dto.meetId)}&password=${encodeURIComponent(dto.password)}`,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
        ),
      );
      if (!sessionRes.data?.ok) {
        return { success: false, error: 'Invalid meet ID or password' };
      }
    } catch (err: any) {
      const status = err.response?.status;
      console.error('[testConnection] session error', status, err.response?.data ?? err.message);
      if (status === 401) {
        return { success: false, error: 'Invalid meet ID or password' };
      }
      return { success: false, error: `Could not reach LiftingCast (status ${status ?? err.code ?? err.message})` };
    }

    try {
      const platformsRes = await firstValueFrom(
        this.http.get(`https://liftingcast.com/api/meets/${dto.meetId}/platforms`),
      );
      const ids: string[] = (platformsRes.data?.docs ?? []).map((p: any) => p._id);
      if (!ids.includes(dto.platformId)) {
        return { success: false, error: 'Platform ID not found in this meet' };
      }
    } catch (err: any) {
      console.error('[testConnection] platforms error', err.response?.status, err.response?.data ?? err.message);
      return { success: false, error: 'Could not fetch platform list' };
    }

    return { success: true };
  }

  private async post(baseUrl: string, endpoint: string, body: object): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${baseUrl}/${endpoint}`, body));
    } catch (e) {
      throw new InternalServerErrorException(
        `LiftingCast API error on ${endpoint}: ${(e as Error).message}`,
      );
    }
  }
}
