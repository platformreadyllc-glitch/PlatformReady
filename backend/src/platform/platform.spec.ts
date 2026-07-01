import {
  PlatformClock,
  BREAK_SHORT,
  BREAK_LONG,
} from './models/platform-clock';
import { Remote } from './models/remote';
import { Platform } from './models/platform';
import { PlatformManager } from './models/platform-manager';
import { ClockMode, ClockState } from './models/enums';

// ---------------------------------------------------------------------------
// PlatformClock
// ---------------------------------------------------------------------------

describe('PlatformClock', () => {
  it('starts IDLE in ACTIVE mode with 60s remaining', () => {
    const clock = new PlatformClock();
    expect(clock.mode).toBe(ClockMode.ACTIVE);
    expect(clock.state()).toBe(ClockState.IDLE);
    expect(clock.remaining()).toBe(60.0);
  });

  it('starts on chief clock press', () => {
    const clock = new PlatformClock();
    clock.handleChiefClockPress(1000.0);
    expect(clock.state(1000.0)).toBe(ClockState.RUNNING);
  });

  it('resets on second chief clock press', () => {
    const clock = new PlatformClock();
    clock.handleChiefClockPress(1000.0);
    expect(clock.state(1005.0)).toBe(ClockState.RUNNING);
    clock.handleChiefClockPress(1005.0);
    expect(clock.state()).toBe(ClockState.IDLE);
    expect(clock.remaining()).toBe(60.0);
  });

  it('counts down correctly', () => {
    const clock = new PlatformClock();
    clock.start(0.0);
    expect(clock.remaining(30.0)).toBe(30.0);
    expect(clock.remaining(59.0)).toBe(1.0);
  });

  it('expires after 60s', () => {
    const clock = new PlatformClock();
    clock.start(0.0);
    expect(clock.remaining(61.0)).toBe(0.0);
    expect(clock.state(61.0)).toBe(ClockState.EXPIRED);
  });

  it('configures break mode with custom duration', () => {
    const clock = new PlatformClock();
    clock.configureBreak(600.0);
    expect(clock.mode).toBe(ClockMode.BREAK);
    expect(clock.state()).toBe(ClockState.IDLE);
    expect(clock.remaining()).toBe(600.0);
  });

  it('configures break with arbitrary duration', () => {
    const clock = new PlatformClock();
    clock.configureBreak(300.0);
    expect(clock.remaining()).toBe(300.0);
  });

  it('rejects non-positive break duration', () => {
    const clock = new PlatformClock();
    expect(() => clock.configureBreak(0)).toThrow('positive');
    expect(() => clock.configureBreak(-60)).toThrow('positive');
  });

  it('counts down in break mode', () => {
    const clock = new PlatformClock();
    clock.configureBreak(600.0);
    clock.start(0.0);
    expect(clock.state(0.0)).toBe(ClockState.RUNNING);
    expect(clock.remaining(10.0)).toBe(590.0);
  });

  it('opening attempts open when break remaining > 180s', () => {
    const clock = new PlatformClock();
    clock.configureBreak(600.0);
    expect(clock.openingAttemptsOpen()).toBe(true);
  });

  it('opening attempts closed when break remaining <= 180s', () => {
    const clock = new PlatformClock();
    clock.configureBreak(100.0);
    expect(clock.openingAttemptsOpen()).toBe(false);
  });

  it('calculates opening attempts remaining correctly', () => {
    const clock = new PlatformClock();
    clock.configureBreak(600.0);
    clock.start(0.0);
    expect(clock.openingAttemptsRemaining(0.0)).toBe(420.0);
    expect(clock.openingAttemptsRemaining(420.0)).toBe(0.0);
    expect(clock.openingAttemptsRemaining(500.0)).toBe(0.0);
  });

  it('resets to active mode', () => {
    const clock = new PlatformClock();
    clock.configureBreak(600.0);
    clock.start(0.0);
    clock.resetToActive();
    expect(clock.mode).toBe(ClockMode.ACTIVE);
    expect(clock.state()).toBe(ClockState.IDLE);
    expect(clock.remaining()).toBe(60.0);
  });

  it('exports BREAK_SHORT and BREAK_LONG constants', () => {
    expect(BREAK_SHORT).toBe(600.0);
    expect(BREAK_LONG).toBe(1200.0);
  });
});

// ---------------------------------------------------------------------------
// Remote
// ---------------------------------------------------------------------------

describe('Remote', () => {
  it('left remote has 4 buttons, no clock button', () => {
    const remote = new Remote({
      remoteId: 'left-1',
      role: 'left',
      platformId: 'p1',
    });
    expect(remote.buttonCount).toBe(4);
    expect(remote.hasClockButton).toBe(false);
    expect(remote.availableButtons).toEqual(['red', 'yellow', 'blue', 'white']);
  });

  it('chief remote has 5 buttons including clock', () => {
    const remote = new Remote({
      remoteId: 'chief-1',
      role: 'chief',
      platformId: 'p1',
    });
    expect(remote.buttonCount).toBe(5);
    expect(remote.hasClockButton).toBe(true);
    expect(remote.availableButtons).toContain('clock');
  });

  it('records button presses', () => {
    const remote = new Remote({
      remoteId: 'left-2',
      role: 'left',
      platformId: 'p1',
    });
    remote.pressButton('red');
    expect(remote.lastButtonPressed).toBe('red');
    remote.pressButton('blue');
    expect(remote.lastButtonPressed).toBe('blue');
  });

  it('throws on invalid button press', () => {
    const remote = new Remote({
      remoteId: 'left-3',
      role: 'left',
      platformId: 'p1',
    });
    expect(() => remote.pressButton('clock')).toThrow();
  });

  it('connect and disconnect toggle connected state', () => {
    const remote = new Remote({
      remoteId: 'left-5',
      role: 'left',
      platformId: 'p1',
    });
    expect(remote.connected).toBe(false);
    remote.connect();
    expect(remote.connected).toBe(true);
    remote.disconnect();
    expect(remote.connected).toBe(false);
  });

  it('setBatteryLevel validates range', () => {
    const remote = new Remote({
      remoteId: 'left-6',
      role: 'left',
      platformId: 'p1',
    });
    remote.setBatteryLevel(75);
    expect(remote.batteryLevel).toBe(75);
    expect(() => remote.setBatteryLevel(-1)).toThrow();
    expect(() => remote.setBatteryLevel(101)).toThrow();
  });

  it('updateDisplay throws if no display', () => {
    const remote = new Remote({
      remoteId: 'left-7',
      role: 'left',
      platformId: 'p1',
      hasDisplay: false,
    });
    expect(() => remote.updateDisplay('hello')).toThrow('display');
  });

  it('serialize returns expected shape', () => {
    const remote = new Remote({
      remoteId: 'left-8',
      role: 'left',
      platformId: 'p1',
    });
    const data = remote.serialize();
    expect(data.remoteId).toBe('left-8');
    expect(data.role).toBe('left');
    expect(data.platformId).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

describe('Platform', () => {
  it('registers remotes and reports hasRemote', () => {
    const platform = new Platform({ platformId: 'p1', name: 'Platform 1' });
    platform.registerRemote('left', 'left', { metadata: { mac: 'AA:BB:CC' } });
    platform.registerRemote('chief', 'chief');
    expect(platform.hasRemote('left')).toBe(true);
    expect(platform.hasRemote('chief')).toBe(true);
    expect(platform.getRemote('left').role).toBe('left');
  });

  it('serializes with platformId and name', () => {
    const platform = new Platform({ platformId: 'p1', name: 'Platform 1' });
    platform.registerRemote('left', 'left', { active: true });
    const data = platform.serialize();
    expect(data.platformId).toBe('p1');
    expect(data.name).toBe('Platform 1');
    expect(Object.keys(data.activeRemotes)).toHaveLength(1);
  });

  it('rejects invalid role', () => {
    const platform = new Platform({ platformId: 'p2' });
    expect(() => platform.registerRemote('r1', 'Left_Referee' as any)).toThrow(
      'Invalid role',
    );
    expect(() => platform.registerRemote('r2', '' as any)).toThrow(
      'Invalid role',
    );
  });

  it('accepts all valid roles', () => {
    const platform = new Platform({ platformId: 'p3' });
    platform.registerRemote('left-1', 'left');
    platform.registerRemote('right-1', 'right');
    platform.registerRemote('chief-1', 'chief');
    platform.registerRemote('spare-1', 'spare');
    expect(platform.allRemotes().size).toBe(4);
  });

  it('rejects duplicate role among active remotes', () => {
    const platform = new Platform({ platformId: 'p4' });
    platform.registerRemote('left-1', 'left', { active: true });
    expect(() =>
      platform.registerRemote('left-2', 'left', { active: true }),
    ).toThrow('already assigned');
  });

  it('allows multiple inactive remotes with the same role', () => {
    const platform = new Platform({ platformId: 'p4b' });
    platform.registerRemote('left-1', 'left', { active: false });
    expect(() =>
      platform.registerRemote('left-2', 'left', { active: false }),
    ).not.toThrow();
  });

  it('enforces max total remote slots', () => {
    const platform = new Platform({ platformId: 'p5' });
    for (let i = 0; i < 10; i++) {
      platform.registerRemote(`r-${i}`, 'spare');
    }
    expect(() => platform.registerRemote('extra', 'spare')).toThrow(
      'already has 10 remotes',
    );
  });

  it('enforces max 3 active remotes on registration', () => {
    const platform = new Platform({ platformId: 'p6' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    expect(() =>
      platform.registerRemote('spare-1', 'spare', { active: true }),
    ).toThrow('3 active remotes');
  });

  it('enforces max 3 active remotes on activate', () => {
    const platform = new Platform({ platformId: 'p7' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('phys-1', 'spare', { active: false });
    expect(() => platform.activateRemote('phys-1')).toThrow('3 active remotes');
  });

  it('activate succeeds after deactivating one', () => {
    const platform = new Platform({ platformId: 'p8' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('phys-1', 'spare', { active: false });
    platform.deactivateRemote('left-1');
    platform.activateRemote('phys-1');
    expect(platform.activeRemotes.has('phys-1')).toBe(true);
    expect(platform.activeRemotes.size).toBe(3);
  });

  it('remotes default to inactive when active not specified', () => {
    const platform = new Platform({ platformId: 'p9' });
    platform.registerRemote('phys-1', 'left');
    expect(platform.inactiveRemotes.has('phys-1')).toBe(true);
    expect(platform.activeRemotes.has('phys-1')).toBe(false);
  });

  it('removes a remote', () => {
    const platform = new Platform({ platformId: 'p10' });
    platform.registerRemote('right', 'right');
    const removed = platform.removeRemote('right');
    expect(removed.remoteId).toBe('right');
    expect(platform.hasRemote('right')).toBe(false);
  });

  it('updates metadata', () => {
    const platform = new Platform({
      platformId: 'p11',
      metadata: { venue: 'Main Hall' },
    });
    platform.updateMetadata({ session: 'A' });
    expect(platform.metadata['venue']).toBe('Main Hall');
    expect(platform.metadata['session']).toBe('A');
  });

  it('determines outcome from votes (2 good, 1 bad = good)', () => {
    const platform = new Platform({ platformId: 'p12' });
    const left = platform.registerRemote('left', 'left', { active: true });
    const chief = platform.registerRemote('chief', 'chief', { active: true });
    const right = platform.registerRemote('right', 'right', { active: true });

    left.pressButton('white');
    chief.pressButton('red');
    right.pressButton('white');

    const result = platform.determineOutcome();
    expect(result.outcome).toBe('good');
    expect(result.decisions).toEqual({
      left: 'white',
      chief: 'red',
      right: 'white',
    });
    expect(result.goodVotes).toBe(2);
    expect(result.badVotes).toBe(1);
  });

  it('cast vote updates remote and triggers auto-decision after delay', () => {
    const platform = new Platform({ platformId: 'p13', decisionDelay: 0.5 });
    platform.registerRemote('left', 'left', { active: true });
    platform.registerRemote('chief', 'chief', { active: true });
    platform.registerRemote('right', 'right', { active: true });
    platform.handleClockButton('chief', 0.0);

    platform.castVote('left', 'white');
    expect(platform.getRemote('left').lastButtonPressed).toBe('white');
    expect(platform.readyForAutoDecision(0)).toBe(false);

    platform.castVote('chief', 'red');
    expect(platform.hasCompleteVoteSet()).toBe(false);

    platform.castVote('right', 'white');
    expect(platform.hasCompleteVoteSet()).toBe(true);

    const now = performance.now() / 1000;
    expect(platform.readyForAutoDecision(now)).toBe(false);

    const later = now + 0.6;
    expect(platform.readyForAutoDecision(later)).toBe(true);
    const result = platform.tryDetermineOutcome(later);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('good');
  });

  it('throws when determining outcome with missing role', () => {
    const platform = new Platform({ platformId: 'p14' });
    const left = platform.registerRemote('left', 'left', { active: true });
    const chief = platform.registerRemote('chief', 'chief', { active: true });
    left.pressButton('white');
    chief.pressButton('red');
    expect(() => platform.determineOutcome()).toThrow();
  });

  it('resets votes clears all button state', () => {
    const platform = new Platform({ platformId: 'p15', decisionDelay: 0 });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.clock.start(0.0);

    platform.castVote('left-1', 'white');
    platform.castVote('chief-1', 'red');
    platform.castVote('right-1', 'white');
    expect(platform.hasCompleteVoteSet()).toBe(true);

    platform.resetVotes();

    expect(platform.hasCompleteVoteSet()).toBe(false);
    for (const remote of platform.activeRemotes.values()) {
      expect(remote.lastButtonPressed).toBeNull();
    }
    expect(platform.readyForAutoDecision()).toBe(false);
  });

  it('reset votes on empty platform is a no-op', () => {
    const platform = new Platform({ platformId: 'p16' });
    expect(() => platform.resetVotes()).not.toThrow();
  });

  it('can vote again after reset', () => {
    const platform = new Platform({ platformId: 'p17', decisionDelay: 0 });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });

    platform.clock.start(0.0);
    platform.castVote('left-1', 'red');
    platform.castVote('chief-1', 'red');
    platform.castVote('right-1', 'red');
    const first = platform.tryDetermineOutcome(performance.now() / 1000);
    expect(first).not.toBeNull();
    expect(first!.outcome).toBe('bad');

    // tryDetermineOutcome resets clock to IDLE; restart before voting again
    platform.resetVotes();
    platform.clock.start(performance.now() / 1000);

    platform.castVote('left-1', 'white');
    platform.castVote('chief-1', 'white');
    platform.castVote('right-1', 'white');
    const second = platform.tryDetermineOutcome(performance.now() / 1000);
    expect(second).not.toBeNull();
    expect(second!.outcome).toBe('good');
  });

  it('swapRemotes replaces active remote with inactive one', () => {
    const platform = new Platform({ platformId: 'p18' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('phys-1', 'chief', { active: false });

    platform.swapRemotes('phys-1', 'chief-1');

    expect(platform.activeRemotes.has('phys-1')).toBe(true);
    expect(platform.inactiveRemotes.has('chief-1')).toBe(true);
    expect(platform.activeRemotes.size).toBe(3);
  });

  it('swapRemotes with newRole overrides incoming role', () => {
    const platform = new Platform({ platformId: 'p18b' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('phys-1', 'chief', { active: false });

    platform.swapRemotes('phys-1', 'right-1', 'right');

    expect(platform.activeRemotes.get('phys-1')?.role).toBe('right');
    expect(platform.inactiveRemotes.has('right-1')).toBe(true);
  });

  it('swapRemotes throws if incoming remote is not inactive', () => {
    const platform = new Platform({ platformId: 'p19' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    expect(() => platform.swapRemotes('left-1', 'right-1')).toThrow(
      'Inactive remote',
    );
  });

  it('swapRemotes throws if outgoing remote is not active', () => {
    const platform = new Platform({ platformId: 'p20' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('phys-1', 'right', { active: false });
    expect(() => platform.swapRemotes('phys-1', 'missing')).toThrow(
      'Active remote',
    );
  });

  it('swapRemotes throws for invalid newRole', () => {
    const platform = new Platform({ platformId: 'p21' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('phys-1', 'right', { active: false });
    expect(() => platform.swapRemotes('phys-1', 'left-1', 'spare')).toThrow();
  });

  it('swapRemotes then cast vote works', () => {
    const platform = new Platform({ platformId: 'p22', decisionDelay: 0 });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('phys-chief', 'chief', { active: false });

    platform.swapRemotes('phys-chief', 'chief-1');
    platform.clock.start(0.0);

    platform.castVote('left-1', 'white');
    platform.castVote('right-1', 'white');
    platform.castVote('phys-chief', 'white');

    const result = platform.tryDetermineOutcome(performance.now() / 1000);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('good');
  });

  it('activateRemote moves remote from inactive to active', () => {
    const platform = new Platform({ platformId: 'act1' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('phys-1', 'right', { active: false });
    platform.activateRemote('phys-1');
    expect(platform.activeRemotes.has('phys-1')).toBe(true);
    expect(platform.inactiveRemotes.has('phys-1')).toBe(false);
    expect(platform.activeRemotes.size).toBe(2);
  });

  it('deactivateRemote moves remote from active to inactive', () => {
    const platform = new Platform({ platformId: 'deact1' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.deactivateRemote('left-1');
    expect(platform.inactiveRemotes.has('left-1')).toBe(true);
    expect(platform.activeRemotes.has('left-1')).toBe(false);
    expect(platform.activeRemotes.size).toBe(0);
  });

  // Clock integration

  it('clock button starts clock via platform', () => {
    const platform = new Platform({ platformId: 'clk1' });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.handleClockButton('chief-1', 0.0);
    expect(platform.clock.state(0.0)).toBe(ClockState.RUNNING);
    expect(platform.clock.remaining(30.0)).toBe(30.0);
  });

  it('second clock button press resets clock', () => {
    const platform = new Platform({ platformId: 'clk2' });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.handleClockButton('chief-1', 0.0);
    platform.handleClockButton('chief-1', 5.0);
    expect(platform.clock.state()).toBe(ClockState.IDLE);
    expect(platform.clock.remaining()).toBe(60.0);
  });

  it('clock button on non-chief remote throws', () => {
    const platform = new Platform({ platformId: 'clk3' });
    platform.registerRemote('left-1', 'left', { active: true });
    expect(() => platform.handleClockButton('left-1')).toThrow();
  });

  it('clock button on inactive remote throws', () => {
    const platform = new Platform({ platformId: 'clk4' });
    platform.registerRemote('phys-1', 'chief', { active: false });
    expect(() => platform.handleClockButton('phys-1')).toThrow();
  });

  it('determining outcome resets clock to ACTIVE IDLE', () => {
    const platform = new Platform({ platformId: 'clk5', decisionDelay: 0 });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });

    platform.handleClockButton('chief-1', 0.0);
    expect(platform.clock.state(0.0)).toBe(ClockState.RUNNING);

    platform.castVote('left-1', 'white');
    platform.castVote('chief-1', 'white');
    platform.castVote('right-1', 'white');
    const result = platform.tryDetermineOutcome(performance.now() / 1000);

    expect(result).not.toBeNull();
    expect(platform.clock.mode).toBe(ClockMode.ACTIVE);
    expect(platform.clock.state()).toBe(ClockState.IDLE);
    expect(platform.clock.remaining()).toBe(60.0);
  });

  it('clock button press does not count as a chief vote', () => {
    const platform = new Platform({ platformId: 'clk6a' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });

    // Start clock so votes are accepted, then chief presses clock (resets it)
    platform.clock.start(0.0);
    platform.castVote('left-1', 'white');
    platform.castVote('right-1', 'white');
    platform.handleClockButton('chief-1', 0.0);

    expect(platform.getRefereeVotes()['chief']).toBeNull();
    expect(platform.hasCompleteVoteSet()).toBe(false);
  });

  it('clock button then vote work independently', () => {
    const platform = new Platform({ platformId: 'clk6b', decisionDelay: 0 });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('right-1', 'right', { active: true });

    platform.handleClockButton('chief-1', 0.0);
    platform.castVote('left-1', 'white');
    platform.castVote('chief-1', 'white');
    platform.castVote('right-1', 'white');

    expect(platform.hasCompleteVoteSet()).toBe(true);
    expect(platform.getRefereeVotes()['chief']).toBe('white');
  });

  it('castVote throws during break mode', () => {
    const platform = new Platform({ platformId: 'brk-vote-1' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.clock.configureBreak(600.0);
    platform.clock.start();
    expect(() => platform.castVote('left-1', 'white')).toThrow('break');
  });

  it('castVote throws when clock is idle', () => {
    const platform = new Platform({ platformId: 'idle-vote-1' });
    platform.registerRemote('left-1', 'left', { active: true });
    // Clock starts ACTIVE IDLE by default
    expect(() => platform.castVote('left-1', 'white')).toThrow(
      'clock has started',
    );
  });

  it('castVote succeeds once clock is running', () => {
    const platform = new Platform({ platformId: 'idle-vote-2' });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.handleClockButton('chief-1', 0.0);
    expect(() => platform.castVote('left-1', 'white')).not.toThrow();
  });

  it('handleClockButton throws during break mode', () => {
    const platform = new Platform({ platformId: 'brk-clk-1' });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.clock.configureBreak(600.0);
    platform.clock.start();
    expect(() => platform.handleClockButton('chief-1')).toThrow('break');
  });

  it('toggleAttemptChange flips active state', () => {
    const platform = new Platform({ platformId: 'ac-1' });
    expect(platform.attemptChangeActive).toBe(false);
    platform.toggleAttemptChange();
    expect(platform.attemptChangeActive).toBe(true);
    platform.toggleAttemptChange();
    expect(platform.attemptChangeActive).toBe(false);
  });

  it('attemptChangeActive is included in serialize', () => {
    const platform = new Platform({ platformId: 'ac-2' });
    expect(platform.serialize().attemptChangeActive).toBe(false);
    platform.toggleAttemptChange();
    expect(platform.serialize().attemptChangeActive).toBe(true);
  });

  it('castVote throws when attempt change is active', () => {
    const platform = new Platform({ platformId: 'ac-3' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.handleClockButton('chief-1', 0.0);
    platform.toggleAttemptChange();
    expect(() => platform.castVote('left-1', 'white')).toThrow(
      'attempt change',
    );
  });

  it('handleClockButton throws when attempt change is active', () => {
    const platform = new Platform({ platformId: 'ac-4' });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.toggleAttemptChange();
    expect(() => platform.handleClockButton('chief-1')).toThrow(
      'attempt change',
    );
  });

  it('votes are allowed again after attempt change is deactivated', () => {
    const platform = new Platform({ platformId: 'ac-5' });
    platform.registerRemote('left-1', 'left', { active: true });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.handleClockButton('chief-1', 0.0);
    platform.toggleAttemptChange();
    platform.toggleAttemptChange();
    expect(() => platform.castVote('left-1', 'white')).not.toThrow();
  });

  it('clock is controllable again after attempt change is deactivated', () => {
    const platform = new Platform({ platformId: 'ac-6' });
    platform.registerRemote('chief-1', 'chief', { active: true });
    platform.toggleAttemptChange();
    platform.toggleAttemptChange();
    expect(() => platform.handleClockButton('chief-1')).not.toThrow();
  });

  it('serialize includes clock with correct shape', () => {
    const platform = new Platform({ platformId: 'clk6' });
    const data = platform.serialize();
    expect(data.clock).toBeDefined();
    expect(data.clock.mode).toBe(ClockMode.ACTIVE);
    expect(data.clock.state).toBe(ClockState.IDLE);
    expect(data.clock.remaining).toBe(60.0);
  });
});

// ---------------------------------------------------------------------------
// PlatformManager
// ---------------------------------------------------------------------------

describe('PlatformManager', () => {
  it('adds, gets, and removes platforms', () => {
    const manager = new PlatformManager();
    const platform = new Platform({ platformId: 'p1' });
    manager.addPlatform(platform);
    expect(manager.hasPlatform('p1')).toBe(true);
    expect(manager.getPlatform('p1')).toBe(platform);
    const removed = manager.removePlatform('p1');
    expect(removed).toBe(platform);
    expect(manager.hasPlatform('p1')).toBe(false);
  });

  it('throws when getting unknown platform', () => {
    const manager = new PlatformManager();
    expect(() => manager.getPlatform('missing')).toThrow();
  });

  it('finds which platform owns a remote', () => {
    const manager = new PlatformManager();
    const platform = new Platform({ platformId: 'p2' });
    platform.registerRemote('chief', 'chief');
    manager.addPlatform(platform);

    expect(manager.findRemotePlatform('chief')).toBe(platform);
    expect(manager.findRemotePlatform('missing')).toBeNull();
  });

  it('serializes all platforms', () => {
    const manager = new PlatformManager();
    const platform = new Platform({ platformId: 'p3' });
    platform.registerRemote('left', 'left', { active: true });
    manager.addPlatform(platform);

    const serialized = manager.serializeAll();
    expect(serialized['p3']).toBeDefined();
    expect(serialized['p3'].platformId).toBe('p3');
    expect(serialized['p3'].activeRemotes['left']).toBeDefined();
  });

  it('starts global break on all platforms with same timestamp', () => {
    const manager = new PlatformManager();
    const p1 = new Platform({ platformId: 'g1' });
    const p2 = new Platform({ platformId: 'g2' });
    manager.addPlatform(p1);
    manager.addPlatform(p2);

    manager.startGlobalBreak(1200.0);

    expect(p1.clock.mode).toBe(ClockMode.BREAK);
    expect(p2.clock.mode).toBe(ClockMode.BREAK);
    expect(p1.clock.state(performance.now() / 1000)).toBe(ClockState.RUNNING);
    expect(p2.clock.state(performance.now() / 1000)).toBe(ClockState.RUNNING);
    // Both clocks should have very close remaining times (same start timestamp)
    const diff = Math.abs(p1.clock.remaining() - p2.clock.remaining());
    expect(diff).toBeLessThan(0.01);
  });

  it('global break blocks votes on all platforms', () => {
    const manager = new PlatformManager();
    const p1 = new Platform({ platformId: 'gb1' });
    const p2 = new Platform({ platformId: 'gb2' });
    p1.registerRemote('left-1', 'left', { active: true });
    p2.registerRemote('left-2', 'left', { active: true });
    manager.addPlatform(p1);
    manager.addPlatform(p2);

    manager.startGlobalBreak(600.0);

    expect(() => p1.castVote('left-1', 'white')).toThrow('break');
    expect(() => p2.castVote('left-2', 'white')).toThrow('break');
  });

  it('break on one platform does not block votes on another', () => {
    const manager = new PlatformManager();
    const p1 = new Platform({ platformId: 'iso1' });
    const p2 = new Platform({ platformId: 'iso2' });
    p1.registerRemote('left-1', 'left', { active: true });
    p2.registerRemote('left-2', 'left', { active: true });
    manager.addPlatform(p1);
    manager.addPlatform(p2);

    // Only p1 goes into break; p2 stays in ACTIVE and must have clock running for votes
    p1.clock.configureBreak(600.0);
    p1.clock.start();
    p2.clock.start();

    expect(() => p1.castVote('left-1', 'white')).toThrow('break');
    expect(() => p2.castVote('left-2', 'white')).not.toThrow();
  });

  it('hasPlatform returns false after removePlatform', () => {
    const manager = new PlatformManager();
    const p = new Platform({ platformId: 'rm1' });
    manager.addPlatform(p);
    expect(manager.hasPlatform('rm1')).toBe(true);
    manager.removePlatform('rm1');
    expect(manager.hasPlatform('rm1')).toBe(false);
  });
});

describe('Platform.resetVotes', () => {
  it('does not clear attemptChangeActive', () => {
    const platform = new Platform({ platformId: 'rv-ac-1' });
    platform.toggleAttemptChange();
    platform.resetVotes();
    expect(platform.attemptChangeActive).toBe(true);
  });

  it('does not restart clock when in BREAK mode', () => {
    const platform = new Platform({ platformId: 'rv-brk-1' });
    platform.clock.configureBreak(600.0);
    platform.clock.start();
    platform.resetVotes();
    expect(platform.clock.mode).toBe(ClockMode.BREAK);
  });
});
