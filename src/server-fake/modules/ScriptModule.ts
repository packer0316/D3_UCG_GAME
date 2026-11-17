/**
 * 魚群腳本排程（server 端）：決定何時出哪個群組，追蹤每隻魚的存活窗與死亡名單。
 * 對 client 送 106 SYNC_SCRIPT_ACK（進房同步）與 107 ADD_GROUP_SYNC_NOTIFY（新群組）。
 */
import type { GroupSyncData, ScriptIdData } from '@net/protocol';
import { getGroup, listGroupIds, type GroupEntry } from '@game/path/PathTypes';
import type { FakeServer, FakeServerModule } from '../FakeServer';
import { BACKFILL_SHIFT_MS, SCHEDULE, SUPPORTED_FISH_TYPES, type ScheduleKind } from '../config/scheduleConfig';

interface ActiveGroup {
  groupIndex: number;
  groupId: number;
  kind: string;
  /** server 時間（毫秒），群組 timeline = now - begin */
  begin: number;
  entries: GroupEntry[];
  endMs: number;
  dead: Set<number>;
}

interface KindState {
  def: ScheduleKind;
  candidates: number[];
  next: number;
}

export class ScriptModule implements FakeServerModule {
  readonly id = 'script';
  private server!: FakeServer;
  private groups = new Map<number, ActiveGroup>();
  private kinds: KindState[] = [];
  private started = false;

  install(server: FakeServer): void {
    this.server = server;
    const all = listGroupIds(server.data.groups);
    for (const def of SCHEDULE) {
      const candidates = all.filter((id) => {
        const entries = getGroup(server.data.groups, id)!;
        const types = new Set(entries.map((e) => e.fish + 1));
        if (![...types].every((t) => SUPPORTED_FISH_TYPES.has(t))) return false;
        return def.filter(id, types, entries);
      });
      this.kinds.push({ def, candidates, next: 0 });
      console.info(`[FakeServer] schedule ${def.kind}: ${candidates.length} groups`, candidates);
    }

    server.on('U2G_SYNC_SCRIPT_REQ', () => {
      if (!this.started) this.startScene();
      const now = server.now();
      server.send('G2U_SYNC_SCRIPT_ACK', {
        timeline: now,
        fin: true,
        list: [...this.groups.values()].map((g) => this.toSync(g, now)),
      });
    });
  }

  /** 開場：每個 kind 依偏移回填，模擬進房時已有魚 */
  private startScene(): void {
    this.started = true;
    const now = this.server.now();
    const rng = this.server.rng;
    const shift = rng.range(BACKFILL_SHIFT_MS[0], BACKFILL_SHIFT_MS[1]);
    for (const k of this.kinds) {
      if (k.candidates.length === 0) continue;
      if (k.def.backfill) {
        const n = Math.floor(shift / k.def.intervalMs);
        for (let i = n; i >= 0; i--) {
          const elapsed = i * k.def.intervalMs + rng.range(0, k.def.intervalMs * 0.5);
          this.addGroup(k, now - elapsed, false);
        }
        k.next = now + k.def.intervalMs;
      } else {
        k.next = now + (k.def.firstDelayMs ?? k.def.intervalMs);
      }
    }
  }

  private pickGroup(k: KindState): number {
    const w = k.def.weight;
    return w ? this.server.rng.weighted(k.candidates, w) : this.server.rng.pick(k.candidates);
  }

  private freeIndex(): number {
    for (let i = 1; i < 1000; i++) if (!this.groups.has(i)) return i;
    throw new Error('no free groupIndex');
  }

  /** 加入群組；notify = 是否送 107 */
  addGroup(k: KindState | null, begin: number, notify: boolean, forceGroupId?: number): ActiveGroup | null {
    const groupId = forceGroupId ?? (k ? this.pickGroup(k) : -1);
    const entries = getGroup(this.server.data.groups, groupId);
    if (!entries) return null;
    const endMs = Math.max(...entries.map((e) => (e.delay + e.duration) * 1000));
    const now = this.server.now();
    if (now - begin >= endMs) return null; // 回填時已經結束的不加
    if (k && this.countKind(k.def.kind) >= k.def.maxActive) return null;
    const g: ActiveGroup = {
      groupIndex: this.freeIndex(),
      groupId,
      kind: k?.def.kind ?? 'debug',
      begin,
      entries,
      endMs,
      dead: new Set(),
    };
    this.groups.set(g.groupIndex, g);
    if (notify) {
      this.server.send('G2U_ADD_GROUP_SYNC_NOTIFY', { timeline: now, fin: true, list: [this.toSync(g, now)] });
    }
    return g;
  }

  /** debug：立即加入指定群組 */
  spawnGroup(groupId: number): boolean {
    return this.addGroup(null, this.server.now(), true, groupId) !== null;
  }

  private countKind(kind: string): number {
    let n = 0;
    for (const g of this.groups.values()) if (g.kind === kind) n++;
    return n;
  }

  private toSync(g: ActiveGroup, now: number): GroupSyncData {
    return { groupIndex: g.groupIndex, groupId: g.groupId, timeline: Math.max(0, now - g.begin), isPause: false, deadFishes: [...g.dead] };
  }

  tick(now: number): void {
    if (!this.started) return;
    for (const [idx, g] of this.groups) {
      if (now - g.begin > g.endMs + 100) this.groups.delete(idx);
    }
    for (const k of this.kinds) {
      if (k.candidates.length === 0 || now < k.next) continue;
      k.next = now + k.def.intervalMs;
      this.addGroup(k, now, true);
    }
  }

  /** 魚目前是否存活（在存活窗內且未死亡） */
  getFish(id: ScriptIdData): { fishType: number } | null {
    const g = this.groups.get(id.groupIndex);
    if (!g) return null;
    const e = g.entries[id.fishIndex];
    if (!e || g.dead.has(id.fishIndex)) return null;
    const t = this.server.now() - g.begin;
    // 容許網路延遲造成的些微誤差
    if (t < e.delay * 1000 - 200 || t > (e.delay + e.duration) * 1000 + 500) return null;
    return { fishType: e.fish + 1 };
  }

  killFish(id: ScriptIdData): void {
    this.groups.get(id.groupIndex)?.dead.add(id.fishIndex);
  }

  get activeGroups(): ReadonlyMap<number, { groupId: number; kind: string }> {
    return this.groups;
  }
}
