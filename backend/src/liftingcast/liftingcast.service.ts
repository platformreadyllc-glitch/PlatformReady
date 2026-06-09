import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SetLightsDto } from './dto/set-lights.dto';

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
