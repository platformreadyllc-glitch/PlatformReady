import { PlatformService } from './platform.service';
import { PlatformGateway } from './platform.gateway';
import { ClockMode, ClockState } from './models/enums';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function makeGateway(): jest.Mocked<PlatformGateway> {
  return {
    server: {} as any,
    handleJoin: jest.fn(),
    emitPlatformUpdate: jest.fn(),
    emitGlobalUpdate: jest.fn(),
  } as unknown as jest.Mocked<PlatformGateway>;
}

describe('PlatformService.ensurePlatform', () => {
  it('creates a new platform with virtual remotes on first call', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    const result = svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    expect(result.platformId).toBe('p1');
    expect(result.activeRemotes['kb-left']).toBeDefined();
    expect(result.activeRemotes['kb-chief']).toBeDefined();
    expect(result.activeRemotes['kb-right']).toBeDefined();
  });

  it('returns existing platform on second call without re-creating it', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    const result = svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    expect(result.platformId).toBe('p1');
    expect(Object.keys(result.activeRemotes)).toHaveLength(3);
  });

  it('new platform starts in ACTIVE/IDLE when no break is in progress', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    const result = svc.ensurePlatform({ platformId: 'p1' });
    expect(result.clock.mode).toBe(ClockMode.ACTIVE);
    expect(result.clock.state).toBe(ClockState.IDLE);
  });

  it('new platform inherits an active global break', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(600);

    const result = svc.ensurePlatform({ platformId: 'p2' });
    expect(result.clock.mode).toBe(ClockMode.BREAK);
    expect(result.clock.state).toBe(ClockState.RUNNING);
    expect(result.clock.remaining).toBeGreaterThan(0);
    expect(result.clock.remaining).toBeLessThanOrEqual(600);
  });

  it('new platform does NOT inherit a per-platform break', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 600);

    const result = svc.ensurePlatform({ platformId: 'p2' });
    expect(result.clock.mode).toBe(ClockMode.ACTIVE);
    expect(result.clock.state).toBe(ClockState.IDLE);
  });
});

describe('PlatformService.castVote', () => {
  it('emits platform:updated via gateway after a vote', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    svc.castVote('p1', 'kb-left', 'white' as any);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ platformId: 'p1' }),
    );
  });

  it('returns the current votes and null outcome when not all have voted', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    const result = svc.castVote('p1', 'kb-left', 'white' as any);
    expect(result.outcome).toBeNull();
    expect(result.votes['left']).toBe('white');
  });

  it('throws 400 when voting on a non-existent platform', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    expect(() => svc.castVote('missing', 'kb-left', 'white' as any)).toThrow();
  });
});

describe('PlatformService.resetAttempt', () => {
  it('resets votes and emits update', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    svc.castVote('p1', 'kb-left', 'white' as any);
    gw.emitPlatformUpdate.mockClear();

    svc.resetAttempt('p1');
    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(1);
    const emitted = gw.emitPlatformUpdate.mock.calls[0][1];
    expect(emitted.votes['left']).toBeNull();
  });

  it('does not reset the clock when the platform is in BREAK mode', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 300);
    svc.resetAttempt('p1');
    const platform = svc.getPlatform('p1');
    expect(platform.clock.mode).toBe(ClockMode.BREAK);
  });
});

describe('PlatformService.startGlobalBreak', () => {
  it('puts all existing platforms into BREAK mode and emits updates', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.ensurePlatform({ platformId: 'p2' });

    svc.startGlobalBreak(600);

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.BREAK);
    expect(svc.getPlatform('p2').clock.mode).toBe(ClockMode.BREAK);
    expect(gw.emitGlobalUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('PlatformService.getGlobalBreak', () => {
  it('returns null when no global break is active', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    expect(svc.getGlobalBreak()).toBeNull();
  });

  it('returns endsAt in the future when a break is running', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(600);

    const result = svc.getGlobalBreak();
    expect(result).not.toBeNull();
    expect(result!.endsAt).toBeGreaterThan(Date.now());
  });

  it('returns null and clears state once the break duration has elapsed', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(1);

    jest.advanceTimersByTime(2000);

    const result = svc.getGlobalBreak();
    expect(result).toBeNull();

    // Cleared state: a new platform must not inherit the expired break
    const p2 = svc.ensurePlatform({ platformId: 'p2' });
    expect(p2.clock.mode).toBe(ClockMode.ACTIVE);
  });
});

describe('PlatformService.cancelPlatformBreak', () => {
  it('resets a breaking platform to ACTIVE and emits update', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 300);
    gw.emitPlatformUpdate.mockClear();

    svc.cancelPlatformBreak('p1');

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the platform is not in BREAK', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    gw.emitPlatformUpdate.mockClear();

    svc.cancelPlatformBreak('p1');

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('cancels the pending break reset timer so it does not fire after cancellation', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);
    svc.cancelPlatformBreak('p1');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(2000);

    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });
});

describe('PlatformService.cancelGlobalBreak', () => {
  it('resets all breaking platforms to ACTIVE and emits global update', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.ensurePlatform({ platformId: 'p2' });
    svc.startGlobalBreak(600);

    svc.cancelGlobalBreak();

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(svc.getPlatform('p2').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitGlobalUpdate).toHaveBeenCalledTimes(2);
  });

  it('cancels pending reset timers so they do not fire after cancellation', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(1);
    svc.cancelGlobalBreak();

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(2000);

    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('does not affect platforms that are not in BREAK', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.ensurePlatform({ platformId: 'p2' });
    svc.startPlatformBreak('p1', 300);

    gw.emitPlatformUpdate.mockClear();
    svc.cancelGlobalBreak();

    const p2Emits = gw.emitPlatformUpdate.mock.calls.filter(
      (c) => c[0] === 'p2',
    );
    expect(p2Emits).toHaveLength(0);
  });

  it('clears the global break record so late-joining platforms do not inherit it', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(600);
    svc.cancelGlobalBreak();

    const result = svc.ensurePlatform({ platformId: 'p2' });
    expect(result.clock.mode).toBe(ClockMode.ACTIVE);
  });
});

describe('PlatformService.scheduleBreakReset', () => {
  it('resets clock to ACTIVE after the break duration elapses', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(1001);

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ platformId: 'p1' }),
    );
  });

  it('does not reset if the clock was already reset to ACTIVE before timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);
    svc.getPlatform('p1').clock.resetToActive();

    gw.emitPlatformUpdate.mockClear(); // clear the emit from startPlatformBreak itself

    jest.advanceTimersByTime(1001);

    // Break reset timer saw mode !== BREAK and skipped — clock stays ACTIVE
    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    // No timer-driven emit contained a BREAK-mode clock
    const breakEmits = gw.emitPlatformUpdate.mock.calls.filter(
      (c) => c[1].clock.mode === ClockMode.BREAK,
    );
    expect(breakEmits).toHaveLength(0);
  });

  it('does not throw if the platform was deleted before the timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);
    svc.deletePlatform('p1');

    expect(() => jest.advanceTimersByTime(1001)).not.toThrow();
  });

  it('rescheduling overwrites the old timer so it only fires once', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 10);
    svc.startPlatformBreak('p1', 1);

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(1001);

    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10000);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('PlatformService.scheduleVoteReset', () => {
  function castAllVotes(svc: PlatformService, platformId: string) {
    svc.pressClockButton(platformId, 'kb-chief');
    svc.castVote(platformId, 'kb-left', 'white' as any);
    svc.castVote(platformId, 'kb-chief', 'white' as any);
    svc.castVote(platformId, 'kb-right', 'white' as any);
  }

  it('auto-resets votes and clock after decisionDelay + 6 s', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    expect(svc.getPlatform('p1').hasCompleteVoteSet()).toBe(true);

    jest.advanceTimersByTime(8000);

    expect(svc.getPlatform('p1').hasCompleteVoteSet()).toBe(false);
    expect(svc.getPlatform('p1').clock.state()).toBe(ClockState.IDLE);
    const lastEmit = gw.emitPlatformUpdate.mock.calls.at(-1)![1];
    expect(lastEmit.hasCompleteVoteSet).toBe(false);
  });

  it('manual resetAttempt cancels the auto-reset', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    svc.resetAttempt('p1');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(8000);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op if votes were cleared manually before the timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    svc.getPlatform('p1').resetVotes();

    jest.advanceTimersByTime(8000);

    // Timer saw !hasCompleteVoteSet and returned early — clock was NOT reset
    expect(svc.getPlatform('p1').clock.state()).toBe(ClockState.RUNNING);
  });

  it('does not throw if the platform was deleted before the timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    svc.deletePlatform('p1');
    expect(() => jest.advanceTimersByTime(8000)).not.toThrow();
  });
});

describe('PlatformService clock tick', () => {
  it('emits platform:updated every second while an active clock runs', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(3000);

    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(3);
    expect(gw.emitPlatformUpdate.mock.calls.every((c) => c[0] === 'p1')).toBe(
      true,
    );
  });

  it('stops ticking after resetAttempt', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    svc.resetAttempt('p1');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(3000);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('emits EXPIRED state when the clock runs out and then stops ticking', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(65000);

    const states = gw.emitPlatformUpdate.mock.calls.map(
      (c) => c[1].clock.state,
    );
    expect(states).toContain(ClockState.EXPIRED);

    const countAfterExpiry = gw.emitPlatformUpdate.mock.calls.length;
    jest.advanceTimersByTime(5000);
    expect(gw.emitPlatformUpdate.mock.calls.length).toBe(countAfterExpiry);
  });

  it('ticks during a platform break and stops once the break ends', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 5);

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(4000);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(4);

    jest.advanceTimersByTime(2000); // advance past the 5-second break end
    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(3000);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });
});
