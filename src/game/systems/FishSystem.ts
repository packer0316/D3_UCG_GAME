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
import { Fish, type FishEnv } from '../world/Fish';
import type { FishEfkSetting } from '../world/FishEfkPlayer';
import { FishKilledShow } from '../show/FishKilledShow';

export class FishSystem implements TimelineListener {
  private alive = new Map<number, Fish>();
  private dying = new Set<Fish>();
  private timeline: FishTimeline;
  private killedShow: FishKilledShow;
  /** define.efk 路徑 → 魚身 EFK 設定（預載） */
  private efkSettings = new Map<string, FishEfkSetting>();
  private readonly env: FishEnv;
  shadowColor: [number, number, number] = [0.145, 0.145, 0.337];
  /** 天空場景關閉陰影 */
  shadowVisible = true;

  constructor(private readonly ctx: GameContext) {
    this.timeline = new FishTimeline(this);
    this.killedShow = new FishKilledShow(ctx.actions);
    const { assets } = ctx;
    this.env = {
      efk: ctx.efk,
      playSound: (name) => void ctx.audio.play(name),
      shake: (times, delta) => ctx.events.emit('camera:shake', { times, delta }),
      peekTexture: (path) => assets.peek<THREE.Texture>(`tex:${assets.url(path)}`) ?? null,
      aliveFish: () => this.alive.values(),
    };
  }

  init(): void {
    this.ctx.net.on('G2U_SYNC_SCRIPT_ACK', (d) => this.applySync(d, false));
    this.ctx.net.on('G2U_ADD_GROUP_SYNC_NOTIFY', (d) => this.applySync(d, true));
    // 原版 TimelineSystem:RECV_G2U_CHANGE_SCENE_NOTIFY → ForceEnd：換場景一律清場
    this.ctx.net.on('G2U_CHANGE_SCENE_NOTIFY', () => this.clearAll());
    // 換房（SPEC-UGC §2.1）：場上的魚清掉，等新房間的 106 同步
    this.ctx.net.on('G2U_ROOM_DATA_NOTIFY', () => this.clearAll());
  }

  /** 清場：所有群組結束、場上的魚直接移除（不播死亡表演；死亡表演中的照常播完） */
  clearAll(): void {
    this.timeline.clear();
  }

  /** 預載所有支援魚種的模型、貼圖、魚身 EFK 設定與其 efk 檔（生魚時可同步建立） */
  async preload(types: number[]): Promise<void> {
    const paths = new Set<string>();
    const efkJsons = new Set<string>();
    for (const t of types) {
      const d = getFishDefine(t);
      if (!d) continue;
      if (!d.model.virtual) paths.add(d.model.model);
      if (d.model.texture) paths.add(d.model.texture);
      d.model.pluginNodes?.forEach((p) => paths.add(p.model));
      d.extraTextures?.forEach((p) => paths.add(p));
      if (d.efk) efkJsons.add(d.efk);
    }
    const { assets, efk } = this.ctx;
    await Promise.all([
      ...[...paths].map((p) =>
        (p.endsWith('.c3b') ? assets.model(p) : assets.texture(p)).catch((e) =>
          console.error('[FishSystem] preload failed', p, e),
        ),
      ),
      ...[...efkJsons].map(async (p) => {
        try {
          const setting = await assets.json<FishEfkSetting>(p);
          this.efkSettings.set(p, setting);
          await Promise.all(listEfkFiles(setting).map((f) => efk.load(f).catch(() => undefined)));
        } catch (e) {
          console.error('[FishSystem] fish efk setting failed', p, e);
        }
      }),
    ]);
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
    const tpl = define.model.virtual ? null : (assets.peekModel(define.model.model) ?? null);
    if (!tpl && !define.model.virtual) {
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
        env: this.env,
        efk: define.efk ? (this.efkSettings.get(define.efk) ?? null) : null,
      });
      fish.hooks.onBossComing = (f) => console.info(`[FishSystem] boss coming: ${f.define.name}`);
      fish.start();
    } catch (err) {
      // 單隻魚建立失敗不可影響整個群組同步
      console.error(`[FishSystem] create fish type ${info.fishType} failed`, err);
      return;
    }
    if (!this.shadowVisible) fish.shadowVisible = false;
    // 同序號重複生成：舊的釋放並通知移除（掛在牠身上的魚保留，與原本行為相同）
    const old = this.alive.get(fish.serial);
    if (old) {
      this.alive.delete(old.serial);
      this.release(old);
      this.ctx.events.emit('fish:remove', { serial: old.serial });
    }
    this.alive.set(fish.serial, fish);
    this.ctx.layers.fish.add(fish.node);
    this.ctx.events.emit('fish:spawn', { fish });
  }

  /** 換場景：之後出生的魚與場上的魚都換成新陰影色（原版 ModelMgr:setShadowColor） */
  setShadowColor(c: [number, number, number]): void {
    this.shadowColor = c;
    for (const fish of this.alive.values()) fish.shadowColor = c;
  }

  /** 換場景：天空場景關閉陰影（原版 FishBase:update → SetShadowDisable(GetSceneInSky())） */
  setShadowVisible(v: boolean): void {
    this.shadowVisible = v;
    for (const fish of this.alive.values()) fish.shadowVisible = v;
    for (const fish of this.dying) fish.shadowVisible = v;
  }

  onDelFish(serial: number): void {
    const fish = this.alive.get(serial);
    if (!fish) return;
    this.remove(fish);
  }

  onGroupEnd(groupIndex: number): void {
    for (const fish of [...this.alive.values()]) {
      if (fish.groupIndex === groupIndex) this.remove(fish);
    }
  }

  /** 直接移除（離場，不播死亡表演）；掛在牠身上的魚一起移除 */
  private remove(fish: Fish): void {
    if (!this.alive.delete(fish.serial)) return;
    this.release(fish);
    this.ctx.events.emit('fish:remove', { serial: fish.serial });
    this.removeAttached(fish);
  }

  /** 魚不重用：停掉掛在牠身上的所有動作（受擊白閃 / 晃動 / 雷擊脈動 / 死亡表演），再釋放模型資源 */
  private release(fish: Fish): void {
    this.ctx.actions.stopAll(fish);
    fish.destroy();
  }

  /** 父魚離場 / 死亡 → 掛在牠身上的魚（蒼龍翅膀）一起移除（原版 DestroyByEvent） */
  private removeAttached(parent: Fish): void {
    for (const f of [...this.alive.values()]) {
      if (f.attachedTo !== parent) continue;
      this.timeline.markDead(f.groupIndex, f.fishIndex);
      this.remove(f);
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
    fish.onKilled();
    this.dying.add(fish);
    this.ctx.events.emit('fish:remove', { serial: fish.serial });
    this.removeAttached(fish);
    this.killedShow.play(fish, () => {
      this.dying.delete(fish);
      this.release(fish);
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

/** 魚身 EFK 設定內引用的所有 efk 檔（預載用） */
export function listEfkFiles(setting: FishEfkSetting): string[] {
  const files = new Set<string>();
  const visit = (entries?: { efk?: { file: string } }[]) => entries?.forEach((e) => e.efk && files.add(e.efk.file));
  visit(setting.bodyEfk);
  for (const group of [setting.withActEfk, setting.other]) if (group) Object.values(group).forEach(visit);
  return [...files];
}
