/**
 * 假 Server 核心：訊息分派 + 模組 + tick。
 * 之後要加功能就寫一個 FakeServerModule 並 server.use(module)。
 *
 * UGC（SPEC-UGC §11.2）：玩家資產 ProfileStore、房間目錄 WorldModule、抽卡 / 培養 GachaModule、家園 HomeModule。
 */
import '@game/ugc/UgcProtocol';
import type { ClientToServer, NetMessage, ServerToClient } from '@net/protocol';
import type { Transport } from '@net/Transport';
import type { FishDataFile, GroupDataMap } from '@game/path/PathTypes';
import { Random } from '@core/math/random';
import { RtpEngine } from './rtp/RtpEngine';
import { TARGET_RTP, buildPayouts } from './config/payoutConfig';
import { RoomModule } from './modules/RoomModule';
import { ScriptModule } from './modules/ScriptModule';
import { ShootModule } from './modules/ShootModule';
import { DebugModule } from './modules/DebugModule';
import { ProfileStore, defaultStorage, type KeyValueStorage } from './ugc/ProfileStore';
import { WorldModule } from './ugc/WorldModule';
import { GachaModule } from './ugc/GachaModule';
import { HomeModule } from './ugc/HomeModule';

export interface FakeServerModule {
  readonly id: string;
  install(server: FakeServer): void;
  tick?(nowMs: number, dtMs: number): void;
}

export interface FakeServerData {
  groups: GroupDataMap;
  fishData: FishDataFile;
}

export interface FakeServerOptions {
  rtp?: number;
  seed?: number;
  tickMs?: number;
  /** 存檔位置；省略 = 瀏覽器 localStorage（拿不到就用記憶體） */
  storage?: KeyValueStorage;
  /** 真實時間（毫秒，Date.now）：場景輪替起點、離線收益；測試可換 */
  wallClock?: () => number;
  /** server 時鐘（毫秒）；省略 = performance.now() 起算。測試可換成手動推進的時鐘 */
  clock?: () => number;
  /** false = 不自動 tick（測試自己呼叫 tickOnce） */
  autoTick?: boolean;
}

type Handler<T> = (data: T) => void;

export class FakeServer {
  readonly rng: Random;
  readonly rtp: RtpEngine;
  readonly profile: ProfileStore;
  readonly world: WorldModule;
  readonly room: RoomModule;
  readonly script: ScriptModule;
  readonly shoot: ShootModule;
  readonly gacha: GachaModule;
  readonly home: HomeModule;
  readonly wallClock: () => number;
  private modules: FakeServerModule[] = [];
  private handlers = new Map<string, Handler<unknown>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private startAt = performance.now();
  private lastTick = 0;
  private readonly clock: (() => number) | undefined;
  private readonly onPageHide = () => this.profile.flush();

  constructor(
    private readonly transport: Transport,
    readonly data: FakeServerData,
    opts: FakeServerOptions = {},
  ) {
    this.rng = new Random(opts.seed);
    this.rtp = new RtpEngine(opts.rtp ?? TARGET_RTP, opts.seed);
    this.wallClock = opts.wallClock ?? (() => Date.now());
    this.clock = opts.clock;
    this.profile = new ProfileStore(opts.storage ?? defaultStorage(), this.wallClock);
    const odds = new Map(data.fishData.Fishes.map((f) => [f.Data, f.Odds]));
    for (const [type, payout] of buildPayouts(odds)) this.rtp.setPayout(type, payout);

    transport.onMessage((msg: NetMessage) => {
      const h = this.handlers.get(msg.cmd);
      if (!h) {
        console.warn(`[FakeServer] no handler for ${msg.cmd}`);
        return;
      }
      try {
        h(msg.data);
      } catch (err) {
        console.error(`[FakeServer] ${msg.cmd} failed`, err);
      }
    });

    // 模組之間會互相呼叫（server.room / server.script …）：先全部建立，再依序 install
    this.world = new WorldModule();
    this.room = new RoomModule();
    this.script = new ScriptModule();
    this.shoot = new ShootModule();
    this.gacha = new GachaModule();
    this.home = new HomeModule();
    this.use(this.world).use(this.room).use(this.script).use(this.shoot).use(new DebugModule()).use(this.gacha).use(this.home);

    if (opts.autoTick !== false) this.timer = setInterval(() => this.tickOnce(), opts.tickMs ?? 50);
    // 離開頁面前把存檔寫完
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
  }

  use(module: FakeServerModule): this {
    this.modules.push(module);
    module.install(this);
    return this;
  }

  /** 伺服器時間（毫秒） */
  now(): number {
    return this.clock ? this.clock() : performance.now() - this.startAt;
  }

  on<K extends keyof ClientToServer>(cmd: K, handler: Handler<ClientToServer[K]>): void {
    this.handlers.set(cmd, handler as Handler<unknown>);
  }

  send<K extends keyof ServerToClient>(cmd: K, data: ServerToClient[K]): void {
    this.transport.send({ cmd, data });
  }

  /** 玩家資產完整快照 → client */
  sendProfile(): void {
    this.send('G2U_PROFILE_NOTIFY', { profile: this.profile.profile });
  }

  /** 跑一次 tick（平常由計時器呼叫；測試可手動呼叫） */
  tickOnce(): void {
    const now = this.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    for (const m of this.modules) m.tick?.(now, dt);
    this.profile.tick(now);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    this.profile.flush();
    this.transport.close();
  }
}
