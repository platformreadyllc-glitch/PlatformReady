import { UnauthorizedException } from '@nestjs/common';
import { MeetConfigService } from './meet-config.service';
import { SaveMeetConfigDto } from './dto/save-meet-config.dto';

function makeConfig(overrides: Partial<SaveMeetConfigDto> = {}): SaveMeetConfigDto {
  return {
    name: 'Test Meet',
    startDate: '2026-01-01',
    numDays: 1,
    numPlatforms: 1,
    liftingCastPassword: 'super-secret',
    perDayPasswords: false,
    days: [
      {
        liftingCastMeetId: 'm1',
        liftingCastPassword: 'super-secret',
        platforms: [
          {
            name: 'Platform 1',
            sessionCount: 1,
            liftingCastPlatformId: 'p1',
            active: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('MeetConfigService', () => {
  describe('getSummary', () => {
    it('returns null before any config is saved', () => {
      const svc = new MeetConfigService();
      expect(svc.getSummary()).toBeNull();
    });

    it('strips LiftingCast credentials, keeping only name/active per platform', () => {
      const svc = new MeetConfigService();
      const token = svc.unlock('pw');
      svc.save(token, makeConfig());

      const summary = svc.getSummary();

      expect(summary).toEqual({
        name: 'Test Meet',
        startDate: '2026-01-01',
        days: [{ platforms: [{ name: 'Platform 1', active: true }] }],
        activeDayIndex: 0,
        completedDayIndices: [],
      });
      expect(JSON.stringify(summary)).not.toContain('secret');
      expect(JSON.stringify(summary)).not.toContain('m1');
    });

    it('includes the current active-day state', () => {
      const svc = new MeetConfigService();
      const token = svc.unlock('pw');
      svc.save(token, makeConfig());
      svc.setActiveDay({ index: 2, completedIndices: [0, 1] });

      expect(svc.getSummary()).toMatchObject({
        activeDayIndex: 2,
        completedDayIndices: [0, 1],
      });
    });
  });

  describe('unlock', () => {
    it('bootstraps the admin password on the first call, for any password', () => {
      const svc = new MeetConfigService();
      const token = svc.unlock('first-password-wins');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('accepts the same password again after bootstrapping', () => {
      const svc = new MeetConfigService();
      svc.unlock('correct-horse');
      const token2 = svc.unlock('correct-horse');
      expect(typeof token2).toBe('string');
    });

    it('rejects a different password once one is set', () => {
      const svc = new MeetConfigService();
      svc.unlock('correct-horse');
      expect(() => svc.unlock('wrong-guess')).toThrow(UnauthorizedException);
    });

    it('issues a fresh token on every successful unlock, all remaining valid for save()', () => {
      const svc = new MeetConfigService();
      const t1 = svc.unlock('pw');
      const t2 = svc.unlock('pw');
      expect(t1).not.toBe(t2);
      expect(() => svc.save(t1, makeConfig())).not.toThrow();
      expect(() => svc.save(t2, makeConfig())).not.toThrow();
    });
  });

  describe('getFull (not token-gated - Director View needs this without unlocking Meet Setup)', () => {
    it('returns null before the first save, with no token at all', () => {
      const svc = new MeetConfigService();
      expect(svc.getFull()).toBeNull();
    });

    it('returns the full config, credentials included, once saved - no token needed to read it back', () => {
      const svc = new MeetConfigService();
      const token = svc.unlock('pw');
      const config = makeConfig();
      svc.save(token, config);

      expect(svc.getFull()).toEqual(config);
    });
  });

  describe('save (token-gated)', () => {
    it('rejects save with no token, and does not persist the attempted config', () => {
      const svc = new MeetConfigService();
      expect(() => svc.save(undefined, makeConfig())).toThrow(
        UnauthorizedException,
      );
      expect(svc.getSummary()).toBeNull();
    });

    it('rejects save with an unrecognized token', () => {
      const svc = new MeetConfigService();
      svc.unlock('pw');
      expect(() => svc.save('not-a-real-token', makeConfig())).toThrow(
        UnauthorizedException,
      );
    });

    it('a valid token can save the config', () => {
      const svc = new MeetConfigService();
      const token = svc.unlock('pw');
      const config = makeConfig();

      svc.save(token, config);

      expect(svc.getFull()).toEqual(config);
    });
  });

  describe('active day', () => {
    it('defaults to day 0, nothing completed', () => {
      const svc = new MeetConfigService();
      expect(svc.getActiveDay()).toEqual({ index: 0, completedIndices: [] });
    });

    it('is not gated by a token - Director View controls it without unlocking Meet Setup', () => {
      const svc = new MeetConfigService();
      expect(() =>
        svc.setActiveDay({ index: 1, completedIndices: [0] }),
      ).not.toThrow();
      expect(svc.getActiveDay()).toEqual({ index: 1, completedIndices: [0] });
    });
  });
});
