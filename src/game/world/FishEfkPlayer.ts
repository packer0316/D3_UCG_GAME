/**
 * 魚身 EFK — 翻譯自原版 FishSpriteBase（InitEfkSetting / PlayEfkWithAnimKey / CreateShockCamWithAnimAct / CreateSoundWithAnimAct）
 *
 * 設定檔由 tools/copy-assets.mjs 從原版 <魚>EfkSetting.lua 轉成 public/res/Data/FishEfk/*.json（SPEC §14.2）
 *
 * - bodyEfk：生成時播放（通常 duration = -1 常駐）
 * - withActEfk[anim]：每次播放該動畫（含 loop 每一輪）時播放；
 *   EFK 掛在 bone（找不到 → 掛在 sprite），音效在 efk.delay + sound.delay 後播，震動在 efk.delay 後
 * - 魚回收時全部停止（原版 ClearLoopBodyEfk / ClearEfkCache）
 */
import type * as THREE from 'three';
import { findCocosNode } from '@engine/loaders/C3bLoader';
import type { EfkHandle, EfkSetting, EfkSystem } from '@engine/effekseer/EfkSystem';

export interface FishEfkEntry {
  efk?: EfkSetting;
  bone?: string;
  sound?: { source: string; delay?: number; duration?: number };
  shockWorld?: { times: number; delta: number };
}

export interface FishEfkSetting {
  bodyEfk?: FishEfkEntry[];
  withActEfk?: Record<string, FishEfkEntry[]>;
  other?: Record<string, FishEfkEntry[]>;
}

/** 魚需要的外部能力（由 FishSystem 注入，魚不直接依賴 GameContext） */
export interface FishFxHost {
  efk: EfkSystem;
  playSound(name: string): void;
  shake(times: number, delta: number): void;
}

interface Pending {
  at: number;
  run: () => void;
}

export class FishEfkPlayer {
  private handles: EfkHandle[] = [];
  private pending: Pending[] = [];
  private time = 0;
  /** 晚加入快轉時不播特效 / 音效 */
  muted = false;

  constructor(
    private readonly host: FishFxHost,
    private readonly sprite: THREE.Object3D,
    private readonly setting: FishEfkSetting | null,
  ) {}

  /** FishSpriteBase:InitEfkSetting */
  playBody(): void {
    if (this.setting?.bodyEfk) this.playEntries(this.setting.bodyEfk, true);
  }

  /** FishSpriteBase:CreateSpriteAnim → Spawn(anim, PlayEfkWithAnimKey, ShockCam, Sound) */
  playAnim(key: string): void {
    const entries = this.setting?.withActEfk?.[key];
    if (entries) this.playEntries(entries, false);
  }

  /** 播 other 群組（例如 AzureDragon 的 WingToCannonLevelUp） */
  playOther(key: string): void {
    const entries = this.setting?.other?.[key];
    if (entries) this.playEntries(entries, false);
  }

  private playEntries(entries: FishEfkEntry[], force: boolean): void {
    if (this.muted && !force) return;
    for (const e of entries) {
      if (e.efk) {
        const attach = (e.bone ? findCocosNode(this.sprite, e.bone) : null) ?? this.sprite;
        this.handles.push(this.host.efk.play(e.efk, attach));
      }
      const efkDelay = e.efk?.delay ?? 0;
      const { sound, shockWorld } = e;
      if (sound && !this.muted) this.schedule(efkDelay + (sound.delay ?? 0), () => this.host.playSound(sound.source));
      if (shockWorld && !this.muted) this.schedule(efkDelay, () => this.host.shake(shockWorld.times, shockWorld.delta));
    }
    if (this.handles.length > 32) this.handles = this.handles.filter((h) => h.alive);
  }

  private schedule(delay: number, run: () => void): void {
    if (delay <= 0) run();
    else this.pending.push({ at: this.time + delay, run });
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > this.time);
    for (const p of due) p.run();
  }

  /** 取消尚未觸發的音效 / 震動（原版 stopAllActions） */
  cancelPending(): void {
    this.pending = [];
  }

  stopAll(): void {
    for (const h of this.handles) h.stop();
    this.handles = [];
    this.pending = [];
  }
}
