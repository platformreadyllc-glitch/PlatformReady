import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SetLightsDto } from './dto/set-lights.dto';

@Injectable()
export class LiftingCastService {
  private readonly baseUrl: string;
  private readonly meetId: string;
  private readonly platformId: string;
  private readonly password: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.meetId = this.config.getOrThrow<string>('LIFTINGCAST_MEET_ID');
    this.platformId = this.config.getOrThrow<string>('LIFTINGCAST_PLATFORM_ID');
    this.password = this.config.getOrThrow<string>('LIFTINGCAST_PASSWORD');
    this.baseUrl = `https://liftingcast.com/api/meets/${this.meetId}/platforms/${this.platformId}`;
  }

  async setLights(dto: SetLightsDto): Promise<void> {
    await this.post('lights', { ...dto, password: this.password });
  }

  async nextAttempt(): Promise<void> {
    await this.post('next_attempt', { password: this.password });
  }

  async setClock(clockTimerLength: number): Promise<void> {
    await this.post('clock', { clockTimerLength, password: this.password });
  }

  async startClock(): Promise<void> {
    await this.post('start_clock', { password: this.password });
  }

  async resetClock(): Promise<void> {
    await this.post('reset_clock', { password: this.password });
  }

  private async post(endpoint: string, body: object): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.baseUrl}/${endpoint}`, body));
    } catch (e) {
      throw new InternalServerErrorException(
        `LiftingCast API error on ${endpoint}: ${(e as Error).message}`,
      );
    }
  }
}
