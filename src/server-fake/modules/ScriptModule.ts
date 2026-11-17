/**
 * 魚群腳本排程（server 端）：決定何時出哪個群組，追蹤每隻魚的存活窗與死亡名單。
 * 對 client 送 106 SYNC_SCRIPT_ACK（進房同步）與 107 ADD_GROUP_SYNC_NOTIFY（新群組）。
 *
 * - 場景限定魚種：挑群組 / debug 召喚時依 RoomModule.sceneType 過濾（SPEC §15.4）；換場景時清掉所有群組重新排程。
 * - 房間允許魚種（SPEC-UGC §2.3）：群組只要含至少一隻目前場景格放出的魚就可以出；
 *   不允許的魚出場時就標成已死亡（deadFishes）→ client 不生、server 不接受命中。
 * - 換房 reset()；裝潢模式 pause() / resume()。
 */
import type { GroupSyncData, ScriptIdData } from '@net/protocol';
import { getGroup, listGroupIds, type GroupEntry } from '@game/path/PathTypes';
import { isGroupAllowedInScene } from '@game/define/SceneDefine';
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
  /** 裝潢模式：不出魚 */
  private paused = false;
  /** groupId → 群組內魚種（場景限制用） */
  private groupTypes = new Map<number, Set<number>>();

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

    server.on('U2G_SYNC_SCRIPT_REQ', () => this.sync());
  }

  /** 送完整同步；第一次（或 reset / resume 之後）先開場回填 */
  private sync(): void {
    if (!this.started && !this.paused) this.startScene();
    const now = this.server.now();
    this.server.send('G2U_SYNC_SCRIPT_ACK', {
      timeline: now,
      fin: true,
      list: [...this.groups.values()].map((g) => this.toSync(g, now)),
    });
  }

  private typesOf(groupId: number): Set<number> | null {
    let types = this.groupTypes.get(groupId);
    if (!types) {
      const entries = getGroup(this.server.data.groups, groupId);
      if (!entries) return null;
      types = new Set(entries.map((e) => e.fish + 1));
      this.groupTypes.set(groupId, types);
    }
    return types;
  }

  /** 群組（整組）可在目前場景出現（debug 召喚用） */
  private allowedInScene(groupId: number): boolean {
    const types = this.typesOf(groupId);
    return !!types && isGroupAllowedInScene(types, this.server.room.sceneType);
  }

  /** 群組在目前場景格可以出：至少一種魚是放出來的，而且放出來的那些魚都允許在目前場景 */
  private usable(groupId: number): boolean {
    const types = this.typesOf(groupId);
    if (!types) return false;
    const room = this.server.room;
    const shown = [...types].filter((t) => room.isAllowed(t));
    return shown.length > 0 && isGroupAllowedInScene(shown, room.sceneType);
  }

  /** 排程間隔 / 首次延遲：家園可以另外訂（屋主放的 Boss 出場頻率較高） */
  private intervalOf(k: KindState): number {
    return (this.server.room.isHome ? k.def.home?.intervalMs : undefined) ?? k.def.intervalMs;
  }
  private firstDelayOf(k: KindState): number | undefined {
    return (this.server.room.isHome ? k.def.home?.firstDelayMs : undefined) ?? k.def.firstDelayMs;
  }

  /** 開場：每個 kind 依偏移回填，模擬進房時已有魚 */
  private startScene(): void {
    this.started = true;
    const now = this.server.now();
    const rng = this.server.rng;
    const shift = rng.range(BACKFILL_SHIFT_MS[0], BACKFILL_SHIFT_MS[1]);
    for (const k of this.kinds) {
      if (k.candidates.length === 0) continue;
      const interval = this.intervalOf(k);
      if (k.def.backfill) {
        const n = Math.floor(shift / interval);
        for (let i = n; i >= 0; i--) {
          const elapsed = i * interval + rng.range(0, interval * 0.5);
          this.addGroup(k, now - elapsed, false);
        }
        k.next = now + interval;
      } else {
        k.next = now + (this.firstDelayOf(k) ?? interval);
      }
    }
  }

  /** 依權重挑一個目前場景格可出現的群組；沒有 → -1 */
  private pickGroup(k: KindState): number {
    const list = k.candidates.filter((id) => this.usable(id));
    if (list.length === 0) return -1;
    const w = k.def.weight;
    return w ? this.server.rng.weighted(list, w) : this.server.rng.pick(list);
  }

  private freeIndex(): number {
    for (let i = 1; i < 1000; i++) if (!this.groups.has(i)) return i;
    throw new Error('no free groupIndex');
  }

  /** 加入群組；notify = 是否送 107。排程出的群組（k != null）只留放出來的魚，debug 召喚整組都出 */
  addGroup(k: KindState | null, begin: number, notify: boolean, forceGroupId?: number): ActiveGroup | null {
    const groupId = forceGroupId ?? (k ? this.pickGroup(k) : -1);
    const entries = getGroup(this.server.data.groups, groupId);
    if (!entries) return null;
    const room = this.server.room;
    const dead = new Set<number>();
    if (k) entries.forEach((e, i) => !room.isAllowed(e.fish + 1) && dead.add(i));
    const alive = entries.filter((_, i) => !dead.has(i));
    if (alive.length === 0) return null;
    const endMs = Math.max(...alive.map((e) => (e.delay + e.duration) * 1000));
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
      dead,
    };
    this.groups.set(g.groupIndex, g);
    if (notify) {
      this.server.send('G2U_ADD_GROUP_SYNC_NOTIFY', { timeline: now, fin: true, list: [this.toSync(g, now)] });
    }
    return g;
  }

  /** debug：立即加入指定群組（不在允許場景 → false） */
  spawnGroup(groupId: number): boolean {
    if (this.paused || !this.allowedInScene(groupId)) return false;
    return this.addGroup(null, this.server.now(), true, groupId) !== null;
  }

  /**
   * 換場景（client 收到 G2U_CHANGE_SCENE_NOTIFY 會清場）：清掉所有群組，
   * 各排程從頭計時（next = now + firstDelayMs），不回填
   */
  resetScene(): void {
    this.groups.clear();
    if (!this.started) return;
    const now = this.server.now();
    for (const k of this.kinds) k.next = now + (this.firstDelayOf(k) ?? 0);
  }

  /** 換房：清掉所有群組，等 client 重新要求同步時再開場回填 */
  reset(): void {
    this.groups.clear();
    this.started = false;
    this.paused = false;
  }

  /** 裝潢模式：清場、不再出魚 */
  pause(): void {
    this.groups.clear();
    this.paused = true;
  }

  /** 離開裝潢模式：重新開場回填並送完整同步 */
  resume(): void {
    this.paused = false;
    this.started = false;
    this.sync();
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
    if (!this.started || this.paused) return;
    for (const [idx, g] of this.groups) {
      if (now - g.begin > g.endMs + 100) this.groups.delete(idx);
    }
    for (const k of this.kinds) {
      if (k.candidates.length === 0 || now < k.next) continue;
      k.next = now + this.intervalOf(k);
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

  get activeGroups(): ReadonlyMap<number, { groupId: number; kind: string; dead: ReadonlySet<number>; entries: readonly GroupEntry[] }> {
    return this.groups;
  }
}
