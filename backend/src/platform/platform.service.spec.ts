import { PlatformService } from './platform.service';
import { PlatformGateway } from './platform.gateway';
import { EspRemotesGateway } from './esp-remotes.gateway';
import { LiftingCastService } from '../liftingcast/liftingcast.service';
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

function makeLc(): jest.Mocked<LiftingCastService> {
  return {
    notifyLights: jest.fn().mockResolvedValue(undefined),
    notifyNextAttempt: jest.fn().mockResolvedValue(undefined),
    notifySetClock: jest.fn().mockResolvedValue(undefined),
    notifyClockStart: jest.fn().mockResolvedValue(undefined),
    notifyClockReset: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LiftingCastService>;
}

function makeEspGateway(): jest.Mocked<EspRemotesGateway> {
  return {
    pushAssignment: jest.fn(),
    broadcastPlatformState: jest.fn(),
  } as unknown as jest.Mocked<EspRemotesGateway>;
}

describe('PlatformService.ensurePlatform', () => {
  it('creates a new platform with virtual remotes on first call', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    const result = svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    expect(result.platformId).toBe('p1');
    expect(result.activeRemotes['kb-left']).toBeDefined();
    expect(result.activeRemotes['kb-chief']).toBeDefined();
    expect(result.activeRemotes['kb-right']).toBeDefined();
  });

  it('returns existing platform on second call without re-creating it', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    const result = svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    expect(result.platformId).toBe('p1');
    expect(Object.keys(result.activeRemotes)).toHaveLength(3);
  });

  it('new platform starts in ACTIVE/IDLE when no break is in progress', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    const result = svc.ensurePlatform({ platformId: 'p1' });
    expect(result.clock.mode).toBe(ClockMode.ACTIVE);
    expect(result.clock.state).toBe(ClockState.IDLE);
  });

  it('new platform inherits an active global break', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 600);

    const result = svc.ensurePlatform({ platformId: 'p2' });
    expect(result.clock.mode).toBe(ClockMode.ACTIVE);
    expect(result.clock.state).toBe(ClockState.IDLE);
  });
});

describe('PlatformService.registerPhysicalRemote', () => {
  it('registers a new remote into the pool as spare', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    const result = svc.registerPhysicalRemote({
      remoteId: 'phys-1',
      hardwareType: 'side',
    } as any);
    expect(result.role).toBe('spare');
    expect(result.platformId).toBeNull();
    expect(result.hardwareType).toBe('side');
  });

  it('backfills hardwareType/capabilities on an already-active remote instead of ignoring them', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1', name: 'P1' });
    svc.deactivateRemote('p1', 'kb-left'); // free a slot — ensurePlatform seeds 3 active kb-* remotes
    svc.registerPhysicalRemote({
      remoteId: 'phys-2',
      hardwareType: 'side',
    } as any);
    svc.activateRemote('p1', 'phys-2', 'left' as any);

    // Simulates a remote that was already active before hardwareType
    // existed (or before its firmware started reporting it), re-registering
    // under the current firmware — role/platform must stay untouched, but
    // capabilities should refresh rather than staying undefined forever.
    const result = svc.registerPhysicalRemote({
      remoteId: 'phys-2',
      hardwareType: 'side',
      hasVibration: true,
    } as any);
    expect(result.platformId).toBe('p1');
    expect(result.role).toBe('left');
    expect(result.hardwareType).toBe('side');
    expect(result.hasVibration).toBe(true);
  });
});

describe('PlatformService.castVote', () => {
  it('emits platform:updated via gateway after a vote', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    const result = svc.castVote('p1', 'kb-left', 'white' as any);
    expect(result.outcome).toBeNull();
    expect(result.votes['left']).toBe('white');
  });

  it('throws 400 when voting on a non-existent platform', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    expect(() => svc.castVote('missing', 'kb-left', 'white' as any)).toThrow();
  });
});

describe('PlatformService.pressClockButton', () => {
  it('syncs LiftingCast to the 60s attempt duration before starting it', async () => {
    const gw = makeGateway();
    const lc = makeLc();
    const svc = new PlatformService(gw, lc);
    svc.ensurePlatform({ platformId: 'p1' });

    svc.pressClockButton('p1', 'kb-chief');
    await Promise.resolve();
    await Promise.resolve();

    expect(lc.notifySetClock).toHaveBeenCalledWith('p1', 60);
    expect(lc.notifyClockStart).toHaveBeenCalledWith('p1');
    // Order matters - LC needs the duration set before it's told to start.
    const setOrder = lc.notifySetClock.mock.invocationCallOrder[0];
    const startOrder = lc.notifyClockStart.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(startOrder);
  });

  it('resyncs to 60s even after a break configured LiftingCast to a longer duration', async () => {
    // Reproduces the actual bug: a break sets LC's clock to e.g. 600s: LC
    // has no idea an attempt clock should be 60s unless told again.
    const gw = makeGateway();
    const lc = makeLc();
    const svc = new PlatformService(gw, lc);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 600);
    svc.cancelPlatformBreak('p1');
    lc.notifySetClock.mockClear();

    svc.pressClockButton('p1', 'kb-chief');
    await Promise.resolve();
    await Promise.resolve();

    expect(lc.notifySetClock).toHaveBeenCalledWith('p1', 60);
  });
});

describe('PlatformService ESP32 WS integration', () => {
  it('findRemote passes through to the pool, active platforms, and unknown ids', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    expect(svc.findRemote('kb-left')?.remoteId).toBe('kb-left');
    expect(svc.findRemote('does-not-exist')).toBeUndefined();
  });

  it('markRemoteConnected/Disconnected flip Remote.connected and re-emit for an active remote', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    gw.emitPlatformUpdate.mockClear();

    svc.markRemoteConnected('kb-left');
    expect(svc.findRemote('kb-left')?.connected).toBe(true);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        activeRemotes: expect.objectContaining({
          'kb-left': expect.objectContaining({ connected: true }),
        }),
      }),
    );

    gw.emitPlatformUpdate.mockClear();
    svc.markRemoteDisconnected('kb-left');
    expect(svc.findRemote('kb-left')?.connected).toBe(false);
    expect(gw.emitPlatformUpdate).toHaveBeenCalled();
  });

  it('markRemoteConnected records the reported transport, markRemoteDisconnected clears it', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });

    svc.markRemoteConnected('kb-left', 'ethernet');
    expect(svc.findRemote('kb-left')?.transport).toBe('ethernet');

    svc.markRemoteDisconnected('kb-left');
    expect(svc.findRemote('kb-left')?.transport).toBe(null);
  });

  it('markRemoteConnected on an unknown remote is a no-op', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    expect(() => svc.markRemoteConnected('nope')).not.toThrow();
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('markRemoteConnected pushes the platform snapshot to the joining remote', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });

    svc.markRemoteConnected('kb-left');

    expect(esp.broadcastPlatformState).toHaveBeenCalledWith(
      ['kb-left'],
      expect.any(Object),
      expect.objectContaining({ mode: 'ACTIVE' }),
    );
  });

  it('markRemoteDisconnected does not push a snapshot', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.markRemoteConnected('kb-left');
    esp.broadcastPlatformState.mockClear();

    svc.markRemoteDisconnected('kb-left');
    expect(esp.broadcastPlatformState).not.toHaveBeenCalled();
  });

  it('castVote broadcasts the platform votes+clock to ESP32 remotes via espGateway', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    svc.castVote('p1', 'kb-left', 'white' as any);
    expect(esp.broadcastPlatformState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ left: 'white' }),
      expect.objectContaining({ mode: 'ACTIVE' }),
    );
  });

  it('works with no espGateway provided (existing test call-site shape)', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    expect(() => svc.castVote('p1', 'kb-left', 'white' as any)).not.toThrow();
  });

  it('activateRemote pushes the new assignment to espGateway', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.registerPhysicalRemote({
      remoteId: 'side-1',
      hardwareType: 'side',
    } as any);
    svc.deactivateRemote('p1', 'kb-left');
    svc.activateRemote('p1', 'side-1', 'left' as any);
    expect(esp.pushAssignment).toHaveBeenCalledWith('side-1', 'p1', 'left');
  });

  it('deactivateRemote pushes an unassigned (null/null) update to espGateway', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.deactivateRemote('p1', 'kb-left');
    expect(esp.pushAssignment).toHaveBeenCalledWith('kb-left', null, null);
  });
});

describe('PlatformService.resetAttempt', () => {
  it('resets votes and emits update', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.ensurePlatform({ platformId: 'p2' });

    svc.startGlobalBreak(600);

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.BREAK);
    expect(svc.getPlatform('p2').clock.mode).toBe(ClockMode.BREAK);
    expect(gw.emitGlobalUpdate).toHaveBeenCalledTimes(1);
  });

  it('notifies ESP32 remotes on every platform', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.ensurePlatform({ platformId: 'p2' });
    esp.broadcastPlatformState.mockClear();

    svc.startGlobalBreak(600);

    expect(esp.broadcastPlatformState).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Object),
      expect.objectContaining({ mode: 'BREAK' }),
    );
  });
});

describe('PlatformService.getGlobalBreak', () => {
  it('returns null when no global break is active', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    expect(svc.getGlobalBreak()).toBeNull();
  });

  it('returns endsAt in the future when a break is running', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(600);

    const result = svc.getGlobalBreak();
    expect(result).not.toBeNull();
    expect(result!.endsAt).toBeGreaterThan(Date.now());
  });

  it('returns null and clears state once the break duration has elapsed', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 300);
    gw.emitPlatformUpdate.mockClear();

    svc.cancelPlatformBreak('p1');

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitPlatformUpdate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the platform is not in BREAK', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    gw.emitPlatformUpdate.mockClear();

    svc.cancelPlatformBreak('p1');

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('cancels the pending break reset timer so it does not fire after cancellation', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.ensurePlatform({ platformId: 'p2' });
    svc.startGlobalBreak(600);

    svc.cancelGlobalBreak();

    expect(svc.getPlatform('p1').clock.mode).toBe(ClockMode.ACTIVE);
    expect(svc.getPlatform('p2').clock.mode).toBe(ClockMode.ACTIVE);
    expect(gw.emitGlobalUpdate).toHaveBeenCalledTimes(2);
  });

  it('notifies ESP32 remotes that the break ended (no clock tick to self-heal)', () => {
    const gw = makeGateway();
    const esp = makeEspGateway();
    const svc = new PlatformService(gw, makeLc(), esp);
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(600);
    esp.broadcastPlatformState.mockClear();

    svc.cancelGlobalBreak();

    expect(esp.broadcastPlatformState).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Object),
      expect.objectContaining({ mode: 'ACTIVE' }),
    );
  });

  it('cancels pending reset timers so they do not fire after cancellation', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startGlobalBreak(1);
    svc.cancelGlobalBreak();

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(2000);

    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('does not affect platforms that are not in BREAK', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.startPlatformBreak('p1', 1);
    svc.deletePlatform('p1');

    expect(() => jest.advanceTimersByTime(1001)).not.toThrow();
  });

  it('rescheduling overwrites the old timer so it only fires once', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    svc.resetAttempt('p1');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(8000);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op if votes were cleared manually before the timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    svc.getPlatform('p1').resetVotes();

    jest.advanceTimersByTime(8000);

    // Timer saw !hasCompleteVoteSet and returned early — clock was NOT reset
    expect(svc.getPlatform('p1').clock.state()).toBe(ClockState.RUNNING);
  });

  it('does not throw if the platform was deleted before the timer fires', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    castAllVotes(svc, 'p1');
    svc.deletePlatform('p1');
    expect(() => jest.advanceTimersByTime(8000)).not.toThrow();
  });
});

describe('PlatformService clock tick', () => {
  it('emits platform:updated every second while an active clock runs', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
    svc.ensurePlatform({ platformId: 'p1' });
    svc.pressClockButton('p1', 'kb-chief');
    svc.resetAttempt('p1');

    gw.emitPlatformUpdate.mockClear();
    jest.advanceTimersByTime(3000);
    expect(gw.emitPlatformUpdate).not.toHaveBeenCalled();
  });

  it('emits EXPIRED state when the clock runs out and then stops ticking', () => {
    const gw = makeGateway();
    const svc = new PlatformService(gw, makeLc());
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
    const svc = new PlatformService(gw, makeLc());
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
