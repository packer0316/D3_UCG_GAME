/**
 * 群組時間軸 — 翻譯自原版 Model/FishTimeline（FishTimeline / SubFishTimeline / FishTimelineScript）
 *
 * - 每個群組（groupIndex）一個 SubTimeline，有自己的時鐘（秒）與 timeScale
 * - 群組內每隻魚：addtime = delay、deltime = delay + duration；魚序號 = groupIndex*1000 + fishIndex
 * - 晚加入 / 同步：時鐘直接設為 server timeline，已過 deltime 的魚不生，存活魚 pathTime = elapsed - delay
 * - deadFishes 不生；群組在 endtime + 0.1s 結束
 * - 時間只快轉不倒退（SubFishTimeline.lua:206）
 */
import type { GroupEntry } from '../path/PathTypes';

export interface TimelineFish {
  serial: number;
  groupIndex: number;
  fishIndex: number;
  fishType: number;
  pathId: number;
  addTime: number;
  delTime: number;
}

export interface TimelineListener {
  /** elapsed = 生成時已經走了幾秒（晚加入快轉） */
  onAddFish(fish: TimelineFish, elapsed: number, fromScratch: boolean): void;
  /** 自然到期（deltime），無動畫移除 */
  onDelFish(serial: number): void;
  onGroupEnd(groupIndex: number): void;
}

interface TimelineEvent {
  time: number;
  kind: 'add' | 'del';
  fishIndex: number;
}

export class SubTimeline {
  time = 0;
  timeScale = 1;
  paused = false;
  readonly endTime: number;
  readonly fishes: TimelineFish[];
  private events: TimelineEvent[];
  private cursor = 0;
  private dead = new Set<number>();
  private spawned = new Set<number>();
  ended = false;

  constructor(
    readonly groupIndex: number,
    readonly groupId: number,
    entries: GroupEntry[],
    private readonly listener: TimelineListener,
  ) {
    this.fishes = entries.map((e, i) => ({
      serial: groupIndex * 1000 + i,
      groupIndex,
      fishIndex: i,
      fishType: e.fish + 1,
      pathId: e.path,
      addTime: e.delay,
      delTime: e.delay + e.duration,
    }));
    this.events = [];
    for (const f of this.fishes) {
      this.events.push({ time: f.addTime, kind: 'add', fishIndex: f.fishIndex });
      this.events.push({ time: f.delTime, kind: 'del', fishIndex: f.fishIndex });
    }
    // 同時間：先 add 再 del（與原版 table.sort 一致即可）
    this.events.sort((a, b) => a.time - b.time || (a.kind === 'add' ? -1 : 1));
    this.endTime = this.events.length ? this.events[this.events.length - 1].time : 0;
  }

  markDead(fishIndex: number): void {
    this.dead.add(fishIndex);
  }

  /** 快轉到 t（不倒退）；fromScratch=false 代表晚加入（原版 106 路徑） */
  seek(t: number, fromScratch: boolean): void {
    if (t < this.time) return;
    this.time = t;
    this.process(fromScratch);
  }

  advance(dt: number): void {
    if (this.paused || this.ended) return;
    this.time += dt * this.timeScale;
    this.process(true);
  }

  private process(fromScratch: boolean): void {
    while (this.cursor < this.events.length && this.events[this.cursor].time <= this.time) {
      const ev = this.events[this.cursor++];
      const f = this.fishes[ev.fishIndex];
      if (ev.kind === 'add') {
        if (this.dead.has(f.fishIndex)) continue;
        if (f.delTime <= this.time) continue; // 已過期不生
        this.spawned.add(f.fishIndex);
        this.listener.onAddFish(f, this.time - f.addTime, fromScratch && this.time - f.addTime < 0.5);
      } else if (this.spawned.has(f.fishIndex)) {
        this.spawned.delete(f.fishIndex);
        this.listener.onDelFish(f.serial);
      }
    }
    if (!this.ended && this.time >= this.endTime + 0.1) {
      this.ended = true;
      this.listener.onGroupEnd(this.groupIndex);
    }
  }
}

export class FishTimeline {
  private subs = new Map<number, SubTimeline>();

  constructor(private readonly listener: TimelineListener) {}

  /** 加入 / 同步群組（timelineMs = server 群組已過毫秒） */
  addGroup(groupIndex: number, groupId: number, entries: GroupEntry[], timelineMs: number, deadFishes: number[], fromScratch: boolean): SubTimeline {
    let sub = this.subs.get(groupIndex);
    if (sub && sub.groupId !== groupId) {
      // 槽位被重複使用：舊群組強制結束
      this.endGroup(groupIndex);
      sub = undefined;
    }
    if (!sub) {
      sub = new SubTimeline(groupIndex, groupId, entries, this.listener);
      this.subs.set(groupIndex, sub);
    }
    for (const d of deadFishes) sub.markDead(d);
    sub.seek(timelineMs / 1000, fromScratch);
    return sub;
  }

  get(groupIndex: number): SubTimeline | undefined {
    return this.subs.get(groupIndex);
  }

  markDead(groupIndex: number, fishIndex: number): void {
    this.subs.get(groupIndex)?.markDead(fishIndex);
  }

  endGroup(groupIndex: number): void {
    const sub = this.subs.get(groupIndex);
    if (!sub) return;
    this.subs.delete(groupIndex);
    if (!sub.ended) {
      sub.ended = true;
      this.listener.onGroupEnd(groupIndex);
    }
  }

  update(dt: number): void {
    for (const [idx, sub] of this.subs) {
      sub.advance(dt);
      if (sub.ended) this.subs.delete(idx);
    }
  }

  clear(): void {
    for (const idx of [...this.subs.keys()]) this.endGroup(idx);
  }

  get groupCount(): number {
    return this.subs.size;
  }
}
