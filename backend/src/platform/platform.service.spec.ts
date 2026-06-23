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
    expect(gw.emitPlatformUpdate).toHaveBeenCalledWith('p1', expect.objectContaining({ platformId: 'p1' }));
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

describe('PlatformService.scheduleBreakReset', () => {
  it('resets clock to ACTIVE after the break duration elapses', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(1001);

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledWith('p1', expect.objectContaining({ platformId: 'p1' }));
  });

  it('does not reset if the clock was already reset to ACTIVE before timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);
    svc.getPlatform('p1').clock.resetToActive();

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(1001);

    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
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
