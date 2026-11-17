/**
 * 假 Server 核心：訊息分派 + 模組 + tick。
 * 之後要加功能（例如抽卡）就寫一個 FakeServerModule 並 server.use(module)。
 */
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
}

type Handler<T> = (data: T) => void;

export class FakeServer {
  readonly rng: Random;
  readonly rtp: RtpEngine;
  readonly room: RoomModule;
  readonly script: ScriptModule;
  readonly shoot: ShootModule;
  private modules: FakeServerModule[] = [];
  private handlers = new Map<string, Handler<unknown>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private startAt = performance.now();
  private lastTick = 0;

  constructor(
    private readonly transport: Transport,
    readonly data: FakeServerData,
    opts: FakeServerOptions = {},
  ) {
    this.rng = new Random(opts.seed);
    this.rtp = new RtpEngine(opts.rtp ?? TARGET_RTP, opts.seed);
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

    this.room = new RoomModule();
    this.script = new ScriptModule();
    this.shoot = new ShootModule();
    this.use(this.room).use(this.script).use(this.shoot).use(new DebugModule());

    const tickMs = opts.tickMs ?? 50;
    this.timer = setInterval(() => this.tick(), tickMs);
  }

  use(module: FakeServerModule): this {
    this.modules.push(module);
    module.install(this);
    return this;
  }

  /** 伺服器時間（毫秒） */
  now(): number {
    return performance.now() - this.startAt;
  }

  on<K extends keyof ClientToServer>(cmd: K, handler: Handler<ClientToServer[K]>): void {
    this.handlers.set(cmd, handler as Handler<unknown>);
  }

  send<K extends keyof ServerToClient>(cmd: K, data: ServerToClient[K]): void {
    this.transport.send({ cmd, data });
  }

  private tick(): void {
    const now = this.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    for (const m of this.modules) m.tick?.(now, dt);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.transport.close();
  }
}
