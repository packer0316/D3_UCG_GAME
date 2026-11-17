/**
 * 魚系統 — 對照原版 System/FishSystem.lua + TimelineSystem.lua + TMDCommon FishManager.lua
 *
 * - 106 SYNC_SCRIPT_ACK（進房，晚加入）/ 107 ADD_GROUP_SYNC_NOTIFY（新群組）→ FishTimeline
 * - 每幀：群組時鐘推進 → 生 / 刪魚 → 每隻魚 pathTime = 群組時間 − addTime
 * - 擊殺：從存活表移除、標記死亡、播死亡表演後回收
 */
import * as THREE from 'three';
import type { ScriptSyncData } from '@net/protocol';
import { getGroup } from '../path/PathTypes';
import { FishTimeline, type TimelineFish, type TimelineListener } from '../timeline/FishTimeline';
import { getFishDefine } from '../define/FishDefine';
import type { GameContext } from '../GameContext';
import { Fish } from '../world/Fish';
import { FishKilledShow } from '../show/FishKilledShow';

export class FishSystem implements TimelineListener {
  private alive = new Map<number, Fish>();
  private dying = new Set<Fish>();
  private timeline: FishTimeline;
  private killedShow: FishKilledShow;
  shadowColor: [number, number, number] = [0.145, 0.145, 0.337];

  constructor(private readonly ctx: GameContext) {
    this.timeline = new FishTimeline(this);
    this.killedShow = new FishKilledShow(ctx.actions);
  }

  init(): void {
    this.ctx.net.on('G2U_SYNC_SCRIPT_ACK', (d) => this.applySync(d, false));
    this.ctx.net.on('G2U_ADD_GROUP_SYNC_NOTIFY', (d) => this.applySync(d, true));
  }

  /** 預載所有支援魚種的模型（生魚時可同步建立） */
  async preload(types: number[]): Promise<void> {
    const paths = new Set<string>();
    for (const t of types) {
      const d = getFishDefine(t);
      if (!d) continue;
      paths.add(d.model.model);
      if (d.model.texture) paths.add(d.model.texture);
      d.model.pluginNodes?.forEach((p) => paths.add(p.model));
    }
    await Promise.all(
      [...paths].map((p) =>
        (p.endsWith('.c3b') ? this.ctx.assets.model(p) : this.ctx.assets.texture(p)).catch((e) =>
          console.error('[FishSystem] preload failed', p, e),
        ),
      ),
    );
  }

  private applySync(d: ScriptSyncData, fromScratch: boolean): void {
    for (const g of d.list) {
      const entries = getGroup(this.ctx.data.groups, g.groupId);
      if (!entries) {
        console.warn(`[FishSystem] group ${g.groupId} not found`);
        continue;
      }
      this.timeline.addGroup(g.groupIndex, g.groupId, entries, g.timeline, g.deadFishes, fromScratch);
    }
  }

  // ------------------------------------------------------------------
  // TimelineListener
  // ------------------------------------------------------------------

  onAddFish(info: TimelineFish, elapsed: number, fromScratch: boolean): void {
    const define = getFishDefine(info.fishType);
    if (!define) {
      console.warn(`[FishSystem] fish type ${info.fishType} not supported`);
      return;
    }
    const { assets } = this.ctx;
    const tpl = assets.peekModel(define.model.model);
    if (!tpl) {
      // 尚未載入：載完後以當下群組時間補生
      void assets.model(define.model.model).then(() => {
        const sub = this.timeline.get(info.groupIndex);
        if (sub && sub.time < info.delTime) this.onAddFish(info, sub.time - info.addTime, false);
      });
      return;
    }
    const texture = define.model.texture ? (assets.peek<THREE.Texture>(`tex:${assets.url(define.model.texture)}`) ?? null) : null;
    const plugins = (define.model.pluginNodes ?? []).map((p) => assets.peekModel(p.model)!).filter(Boolean);
    const Ctor = this.ctx.registries.fishClass.get(define.fishClass);
    let fish: Fish;
    try {
      fish = new Ctor({
        info,
        define,
        template: tpl,
        texture,
        plugins,
        track: this.ctx.data.paths.get(info.pathId),
        shadowColor: this.shadowColor,
        elapsed,
        fromScratch,
      });
      fish.hooks.onBossComing = (f) => console.info(`[FishSystem] boss coming: ${f.define.name}`);
      fish.start();
    } catch (err) {
      // 單隻魚建立失敗不可影響整個群組同步
      console.error(`[FishSystem] create fish type ${info.fishType} failed`, err);
      return;
    }
    this.alive.get(fish.serial)?.destroy();
    this.alive.set(fish.serial, fish);
    this.ctx.layers.fish.add(fish.node);
    this.ctx.events.emit('fish:spawn', { fish });
  }

  onDelFish(serial: number): void {
    const fish = this.alive.get(serial);
    if (!fish) return;
    this.alive.delete(serial);
    fish.destroy();
    this.ctx.events.emit('fish:remove', { serial });
  }

  onGroupEnd(groupIndex: number): void {
    for (const [serial, fish] of this.alive) {
      if (fish.groupIndex !== groupIndex) continue;
      this.alive.delete(serial);
      fish.destroy();
      this.ctx.events.emit('fish:remove', { serial });
    }
  }

  // ------------------------------------------------------------------

  getFish(serial: number): Fish | undefined {
    return this.alive.get(serial);
  }

  /** 所有存活的魚（含隱藏中 / 不可命中） */
  *aliveFish(): IterableIterator<Fish> {
    yield* this.alive.values();
  }

  /** 可命中的魚 */
  *hittable(): IterableIterator<Fish> {
    for (const f of this.alive.values()) if (f.hittable && !f.dying && f.sprite.visible) yield f;
  }

  /** 擊殺（原版 DelFish(serial, true) → Destroy(true) → PlayDeadShow） */
  killFish(fish: Fish): void {
    if (!this.alive.has(fish.serial)) return;
    this.alive.delete(fish.serial);
    this.timeline.markDead(fish.groupIndex, fish.fishIndex);
    this.dying.add(fish);
    this.ctx.events.emit('fish:remove', { serial: fish.serial });
    this.killedShow.play(fish, () => {
      this.dying.delete(fish);
      fish.destroy();
    });
  }

  update(dt: number): void {
    this.timeline.update(dt);
    for (const fish of this.alive.values()) {
      const sub = this.timeline.get(fish.groupIndex);
      if (sub) fish.setPathTime(sub.time - fish.addTime);
      fish.update(dt);
    }
    for (const fish of this.dying) fish.update(dt);
  }

  get aliveCount(): number {
    return this.alive.size;
  }

  get groupCount(): number {
    return this.timeline.groupCount;
  }
}
