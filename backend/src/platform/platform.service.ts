import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import { PlatformManager } from './models/platform-manager';
import { Platform } from './models/platform';
import { Button, Role, ClockMode, ClockState, Transport } from './models/enums';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { RegisterRemoteDto } from './dto/register-remote.dto';
import { RegisterPhysicalRemoteDto } from './dto/register-physical-remote.dto';
import { ReplaceRemoteDto } from './dto/replace-remote.dto';
import { TransferRemoteDto } from './dto/transfer-remote.dto';
import { EnsurePlatformDto } from './dto/ensure-platform.dto';
import { PlatformGateway } from './platform.gateway';
import { EspRemotesGateway } from './esp-remotes.gateway';
import { LiftingCastService } from '../liftingcast/liftingcast.service';
import { Remote } from './models/remote';

@Injectable()
export class PlatformService {
  private readonly manager = new PlatformManager();
  private readonly breakTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly voteResetTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly clockTickIntervals = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  private globalBreak: { startedAt: number; duration: number } | null = null;

  constructor(
    private readonly gateway: PlatformGateway,
    private readonly liftingCast: LiftingCastService,
    // Optional so the dozens of existing `new PlatformService(gw, makeLc())`
    // test call sites keep compiling untouched - real app wiring always
    // provides it via forwardRef (EspRemotesGateway injects PlatformService
    // right back, a genuine two-way dependency).
    @Inject(forwardRef(() => EspRemotesGateway))
    private readonly espGateway?: EspRemotesGateway,
  ) {}

  // Thin passthrough - used by EspRemotesGateway to validate an incoming WS
  // connection's claimed remoteId.
  findRemote(remoteId: string): Remote | undefined {
    return this.manager.findRemote(remoteId);
  }

  markRemoteConnected(remoteId: string, transport: Transport = null): void {
    const remote = this.manager.findRemote(remoteId);
    if (!remote) return;
    remote.connect(transport);
    this.emitIfActive(remote, true);
  }

  markRemoteDisconnected(remoteId: string): void {
    const remote = this.manager.findRemote(remoteId);
    if (!remote) return;
    remote.disconnect();
    this.emitIfActive(remote, false);
  }

  // Remote.serialize() already includes `connected`, so re-emitting the
  // platform this remote is active on is all a browser tab needs to show
  // live connected-status - no new event type required. Only active remotes
  // matter here: Platform.serialize() doesn't include inactiveRemotes at
  // all, so a benched/pooled remote's connection state has nothing to emit.
  //
  // On connect (pushSnapshot), also send this one remote its current
  // votes+clock over WS - otherwise a remote that joins or reconnects
  // mid-attempt shows a blank/stale mini-scoreboard until the next
  // platform event happens to fire a broadcast.
  private emitIfActive(remote: Remote, pushSnapshot: boolean): void {
    if (!remote.platformId || !this.manager.hasPlatform(remote.platformId)) {
      return;
    }
    const platform = this.manager.getPlatform(remote.platformId);
    if (!platform.activeRemotes.has(remote.remoteId)) return;
    const serialized = platform.serialize();
    this.gateway.emitPlatformUpdate(remote.platformId, serialized);
    if (pushSnapshot) {
      this.espGateway?.broadcastPlatformState(
        [remote.remoteId],
        serialized.votes,
        serialized.clock,
      );
    }
  }

  // Single choke point for "a platform's state changed" - pushes the
  // existing browser-facing update and, new here, the platform's current
  // votes+clock to every ESP32 remote active on it (for the on-remote
  // mini-scoreboard). Replaces the ~13 call sites that used to call
  // gateway.emitPlatformUpdate directly, so the two broadcasts can never
  // drift out of sync as they evolve independently.
  private broadcastPlatformUpdate(
    platformId: string,
    platform: Platform,
  ): void {
    const serialized = platform.serialize();
    this.gateway.emitPlatformUpdate(platformId, serialized);
    this.espGateway?.broadcastPlatformState(
      platform.activeRemotes.keys(),
      serialized.votes,
      serialized.clock,
    );
  }

  // The global-break paths notify browsers via gateway.emitGlobalUpdate,
  // which has no ESP equivalent - without this, cancelling a global break
  // (no clock tick to self-heal it) leaves every remote's mini-scoreboard
  // frozen on the stale BREAK clock until the next per-platform event.
  private pushAllPlatformStateToEsp(): void {
    if (!this.espGateway) return;
    for (const platform of this.manager.listPlatforms()) {
      const serialized = platform.serialize();
      this.espGateway.broadcastPlatformState(
        platform.activeRemotes.keys(),
        serialized.votes,
        serialized.clock,
      );
    }
  }

  createPlatform(dto: CreatePlatformDto): Platform {
    try {
      const platform = new Platform({
        platformId: dto.platformId,
        name: dto.name,
        decisionDelay: dto.decisionDelay,
      });
      this.manager.addPlatform(platform);
      return platform;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  ensurePlatform(dto: EnsurePlatformDto) {
    if (this.manager.hasPlatform(dto.platformId)) {
      return this.manager.getPlatform(dto.platformId).serialize();
    }
    try {
      const platform = new Platform({
        platformId: dto.platformId,
        name: dto.name,
      });
      this.manager.addPlatform(platform);
      platform.registerRemote('kb-left', 'left' as Role, { active: true });
      platform.registerRemote('kb-chief', 'chief' as Role, { active: true });
      platform.registerRemote('kb-right', 'right' as Role, { active: true });

      // If a global break is in progress, sync this platform into it so it
      // can't accept votes while all other platforms are locked.
      // Per-platform breaks are intentionally NOT inherited here.
      if (this.globalBreak) {
        const elapsed = performance.now() / 1000 - this.globalBreak.startedAt;
        const remaining = Math.max(0, this.globalBreak.duration - elapsed);
        if (remaining > 0) {
          platform.clock.configureBreak(remaining);
          platform.clock.start();
          this.scheduleBreakReset(dto.platformId, remaining);
          this.startClockTick(dto.platformId);
        } else {
          this.globalBreak = null;
        }
      }

      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  getPlatform(platformId: string): Platform {
    try {
      return this.manager.getPlatform(platformId);
    } catch {
      throw new NotFoundException(`Platform ${platformId} not found`);
    }
  }

  deletePlatform(platformId: string): void {
    try {
      this.manager.removePlatform(platformId);
    } catch {
      throw new NotFoundException(`Platform ${platformId} not found`);
    }
  }

  listPlatforms() {
    return this.manager.serializeAll();
  }

  // Idempotent: if the remote is already active on any platform, return it
  // unchanged instead of re-registering. Shared by both registration paths.
  private findActiveRemote(remoteId: string): Remote | undefined {
    for (const p of this.manager.listPlatforms()) {
      const active = p.activeRemotes.get(remoteId);
      if (active) return active;
    }
    return undefined;
  }

  registerRemote(platformId: string, dto: RegisterRemoteDto) {
    // Physical remotes always land in the global pool (physicalPool);
    // platform assignment happens later via activateRemote, not here.
    const active = this.findActiveRemote(dto.remoteId);
    if (active) return active.serialize();
    try {
      const remote = this.manager.registerPhysical(
        platformId,
        dto.remoteId,
        dto.role as Role,
        { hasVibration: dto.hasVibration, hasDisplay: dto.hasDisplay },
      );
      return remote.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // Newer registration path: no platformId, no role — the remote always
  // lands in the pool as 'spare' and gets assigned via the management page.
  registerPhysicalRemote(dto: RegisterPhysicalRemoteDto) {
    const active = this.findActiveRemote(dto.remoteId);
    if (active) {
      // Role/platform stay untouched (that's the whole point of the
      // idempotent check), but refresh self-reported capabilities even for
      // an already-assigned remote — otherwise a remote that was active
      // before hardwareType existed would carry hardwareType: undefined
      // forever, since nothing else ever re-derives it.
      active.hardwareType = dto.hardwareType;
      if (dto.hasVibration !== undefined)
        active.hasVibration = dto.hasVibration;
      if (dto.hasDisplay !== undefined) active.hasDisplay = dto.hasDisplay;
      return active.serialize();
    }
    try {
      const remote = this.manager.registerPool(dto.remoteId, dto.hardwareType, {
        hasVibration: dto.hasVibration,
        hasDisplay: dto.hasDisplay,
      });
      return remote.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  getPool() {
    return this.manager.getPool();
  }

  castVote(platformId: string, remoteId: string, button: Button) {
    const platform = this.getPlatform(platformId);
    try {
      platform.castVote(remoteId, button);
      this.broadcastPlatformUpdate(platformId, platform);
      if (platform.hasCompleteVoteSet()) {
        // Fallback: auto-reset if all frontend tabs are backgrounded during the reveal window.
        this.scheduleVoteReset(platformId, platform.decisionDelay + 6);
        // Notify LC after the decision delay — same moment the lights become visible.
        const votes = platform.getRefereeVotes();
        setTimeout(() => {
          this.liftingCast
            .notifyLights(platformId, votes)
            .then(() =>
              this.liftingCast
                .notifyNextAttempt(platformId)
                .catch((e: unknown) => {
                  console.error(
                    '[LC] next attempt notification failed',
                    (e as Error).message,
                  );
                }),
            )
            .catch((e: unknown) => {
              console.error(
                '[LC] lights notification failed',
                (e as Error).message,
              );
            });
        }, platform.decisionDelay * 1000);
      }
      return { votes: platform.getRefereeVotes(), outcome: null };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  pressClockButton(platformId: string, remoteId: string) {
    const platform = this.getPlatform(platformId);
    try {
      platform.handleClockButton(remoteId);
      this.broadcastPlatformUpdate(platformId, platform);
      if (platform.clock.state() === ClockState.RUNNING) {
        this.startClockTick(platformId);
        // LiftingCast's own clock duration is sticky server-side - it stays
        // at whatever was last configured (e.g. a 10/20min break) until
        // something tells it otherwise. Our own PlatformClock is already
        // correctly back at the 60s attempt duration by this point
        // (handleClockButton -> resetToActive() when idle), but LC only
        // finds out if we say so - without this, the first attempt clock
        // after any break kept counting down from the break's duration.
        this.liftingCast
          .notifySetClock(platformId, platform.clock.serialize().duration)
          .then(() =>
            this.liftingCast
              .notifyClockStart(platformId)
              .catch((e: unknown) => {
                console.error(
                  '[LC] clock start notification failed',
                  (e as Error).message,
                );
              }),
          )
          .catch((e: unknown) => {
            console.error(
              '[LC] set clock notification failed',
              (e as Error).message,
            );
          });
      } else {
        this.cancelClockTick(platformId);
        this.liftingCast.notifyClockReset(platformId).catch((e: unknown) => {
          console.error(
            '[LC] clock reset notification failed',
            (e as Error).message,
          );
        });
      }
      return platform.clock.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  resetAttempt(platformId: string) {
    this.cancelVoteReset(platformId);
    this.cancelClockTick(platformId);
    const platform = this.getPlatform(platformId);
    platform.resetVotes();
    if (platform.clock.mode !== ClockMode.BREAK) {
      platform.clock.resetToActive();
    }
    this.broadcastPlatformUpdate(platformId, platform);
    return platform.serialize();
  }

  private scheduleVoteReset(platformId: string, delaySeconds: number) {
    this.cancelVoteReset(platformId);
    const timer = setTimeout(() => {
      this.voteResetTimers.delete(platformId);
      if (!this.manager.hasPlatform(platformId)) return;
      const platform = this.manager.getPlatform(platformId);
      if (!platform.hasCompleteVoteSet()) return;
      platform.resetVotes();
      if (platform.clock.mode !== ClockMode.BREAK) {
        platform.clock.resetToActive();
        this.cancelClockTick(platformId);
      }
      this.broadcastPlatformUpdate(platformId, platform);
    }, delaySeconds * 1000);
    this.voteResetTimers.set(platformId, timer);
  }

  private cancelVoteReset(platformId: string) {
    const timer = this.voteResetTimers.get(platformId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.voteResetTimers.delete(platformId);
    }
  }

  // Emits platform:updated every second while a clock is running so all
  // connected clients stay synchronised without local time estimation.
  private startClockTick(platformId: string) {
    this.cancelClockTick(platformId);
    const id = setInterval(() => {
      if (!this.manager.hasPlatform(platformId)) {
        this.cancelClockTick(platformId);
        return;
      }
      const platform = this.manager.getPlatform(platformId);
      this.broadcastPlatformUpdate(platformId, platform);
      if (platform.clock.state() !== ClockState.RUNNING) {
        this.cancelClockTick(platformId);
      }
    }, 1000);
    this.clockTickIntervals.set(platformId, id);
  }

  private cancelClockTick(platformId: string) {
    const id = this.clockTickIntervals.get(platformId);
    if (id !== undefined) {
      clearInterval(id);
      this.clockTickIntervals.delete(platformId);
    }
  }

  toggleAttemptChange(platformId: string) {
    const platform = this.getPlatform(platformId);
    platform.toggleAttemptChange();
    this.broadcastPlatformUpdate(platformId, platform);
    return platform.serialize();
  }

  activateRemote(platformId: string, remoteId: string, role?: Role) {
    this.getPlatform(platformId); // 404 if not found
    try {
      this.manager.activateRemote(platformId, remoteId, role);
      const platform = this.getPlatform(platformId);
      this.broadcastPlatformUpdate(platformId, platform);
      const activated = platform.activeRemotes.get(remoteId);
      this.espGateway?.pushAssignment(
        remoteId,
        platformId,
        activated?.role ?? null,
      );
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  deactivateRemote(platformId: string, remoteId: string) {
    this.getPlatform(platformId); // 404 if not found
    try {
      this.manager.deactivateRemote(platformId, remoteId);
      const platform = this.getPlatform(platformId);
      this.broadcastPlatformUpdate(platformId, platform);
      this.espGateway?.pushAssignment(remoteId, null, null);
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  replaceRemote(platformId: string, dto: ReplaceRemoteDto) {
    this.getPlatform(platformId); // 404 if not found
    try {
      this.manager.replaceRemote(
        platformId,
        dto.incomingRemoteId,
        dto.outgoingRemoteId,
        dto.newRole as Role | undefined,
      );
      const platform = this.getPlatform(platformId);
      this.broadcastPlatformUpdate(platformId, platform);
      const incoming = platform.activeRemotes.get(dto.incomingRemoteId);
      this.espGateway?.pushAssignment(
        dto.incomingRemoteId,
        platformId,
        incoming?.role ?? null,
      );
      this.espGateway?.pushAssignment(dto.outgoingRemoteId, null, null);
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  transferRemote(platformId: string, remoteId: string, dto: TransferRemoteDto) {
    try {
      this.manager.transferRemote(remoteId, dto.targetPlatformId);
      this.broadcastPlatformUpdate(platformId, this.getPlatform(platformId));
      this.broadcastPlatformUpdate(
        dto.targetPlatformId,
        this.getPlatform(dto.targetPlatformId),
      );
      // transferRemote only frees the remote from its old platform (see
      // PlatformManager.transferRemote) - it isn't activated on the target
      // until a separate activateRemote call, so it's unassigned until then.
      this.espGateway?.pushAssignment(remoteId, null, null);
      return {
        fromPlatformId: platformId,
        targetPlatformId: dto.targetPlatformId,
        remoteId,
      };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  startPlatformBreak(platformId: string, durationSeconds: number) {
    const platform = this.getPlatform(platformId);
    try {
      platform.clock.configureBreak(durationSeconds);
      platform.clock.start();
      this.broadcastPlatformUpdate(platformId, platform);
      this.scheduleBreakReset(platformId, durationSeconds);
      this.startClockTick(platformId);
      this.liftingCast
        .notifySetClock(platformId, durationSeconds)
        .then(() =>
          this.liftingCast.notifyClockStart(platformId).catch((e: unknown) => {
            console.error(
              '[LC] clock start notification failed',
              (e as Error).message,
            );
          }),
        )
        .catch((e: unknown) => {
          console.error(
            '[LC] set clock notification failed',
            (e as Error).message,
          );
        });
      return platform.serialize();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  startGlobalBreak(durationSeconds: number) {
    try {
      this.globalBreak = {
        startedAt: performance.now() / 1000,
        duration: durationSeconds,
      };
      this.manager.startGlobalBreak(durationSeconds);
      const all = this.manager.serializeAll();
      this.gateway.emitGlobalUpdate(all);
      this.pushAllPlatformStateToEsp();
      for (const platform of this.manager.listPlatforms()) {
        this.scheduleBreakReset(platform.platformId, durationSeconds);
        this.startClockTick(platform.platformId);
        this.liftingCast
          .notifySetClock(platform.platformId, durationSeconds)
          .then(() =>
            this.liftingCast
              .notifyClockStart(platform.platformId)
              .catch((e: unknown) => {
                console.error(
                  '[LC] clock start notification failed',
                  (e as Error).message,
                );
              }),
          )
          .catch((e: unknown) => {
            console.error(
              '[LC] set clock notification failed',
              (e as Error).message,
            );
          });
      }
      return all;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  getGlobalBreak(): { endsAt: number } | null {
    if (!this.globalBreak) return null;
    const elapsed = performance.now() / 1000 - this.globalBreak.startedAt;
    const remaining = Math.max(0, this.globalBreak.duration - elapsed);
    if (remaining <= 0) {
      this.globalBreak = null;
      return null;
    }
    return { endsAt: Date.now() + remaining * 1000 };
  }

  cancelPlatformBreak(platformId: string) {
    const platform = this.getPlatform(platformId);
    if (platform.clock.mode !== ClockMode.BREAK) return platform.serialize();
    if (this.breakTimers.has(platformId)) {
      clearTimeout(this.breakTimers.get(platformId)!);
      this.breakTimers.delete(platformId);
    }
    platform.clock.resetToActive();
    this.cancelClockTick(platformId);
    this.liftingCast.notifyClockReset(platformId).catch((e: unknown) => {
      console.error(
        '[LC] clock reset notification failed',
        (e as Error).message,
      );
    });
    this.broadcastPlatformUpdate(platformId, platform);
    return platform.serialize();
  }

  cancelGlobalBreak() {
    this.globalBreak = null;
    for (const platform of this.manager.listPlatforms()) {
      if (platform.clock.mode !== ClockMode.BREAK) continue;
      if (this.breakTimers.has(platform.platformId)) {
        clearTimeout(this.breakTimers.get(platform.platformId)!);
        this.breakTimers.delete(platform.platformId);
      }
      platform.clock.resetToActive();
      this.cancelClockTick(platform.platformId);
      this.liftingCast
        .notifyClockReset(platform.platformId)
        .catch((e: unknown) => {
          console.error(
            '[LC] clock reset notification failed',
            (e as Error).message,
          );
        });
    }
    const all = this.manager.serializeAll();
    this.gateway.emitGlobalUpdate(all);
    this.pushAllPlatformStateToEsp();
    return all;
  }

  private scheduleBreakReset(platformId: string, durationSeconds: number) {
    if (this.breakTimers.has(platformId)) {
      clearTimeout(this.breakTimers.get(platformId)!);
    }
    const timer = setTimeout(() => {
      this.breakTimers.delete(platformId);
      if (!this.manager.hasPlatform(platformId)) return;
      const platform = this.manager.getPlatform(platformId);
      if (platform.clock.mode === ClockMode.BREAK) {
        platform.clock.resetToActive();
        this.cancelClockTick(platformId);
        this.liftingCast.notifyClockReset(platformId).catch((e: unknown) => {
          console.error(
            '[LC] clock reset notification failed',
            (e as Error).message,
          );
        });
        this.broadcastPlatformUpdate(platformId, platform);
      }
    }, durationSeconds * 1000);
    this.breakTimers.set(platformId, timer);
  }
}
