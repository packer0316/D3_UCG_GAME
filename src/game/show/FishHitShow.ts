/**
 * 受擊表演 — 翻譯自原版 FishHitShow.lua（只對本人子彈）
 *
 * Bleach（白閃）：每 0.05s 一步共 5 步，rate = 1 - (1 - p)²（0.36→0.64→0.84→0.96→1.0），結束歸 0；進行中不重觸發
 * Shake：sprite 沿本地 X MoveBy(d/3, +off) → (d/3, -2off) → (d/3, +off)，重複 times 次後歸位；之後 delay 冷卻
 */
import { Act } from '@core/tween/Action';
import type { ActionManager } from '@core/tween/ActionManager';
import { HIT_SHAKE_DEFINE, HitShakeType } from '../define/FishDefine';
import type { Fish } from '../world/Fish';
import { Tw } from './Tweens';

const HIT_BLEACH_DURATION = 0.25;
const HIT_BLEACH_STEP = 5;
const TAG_BLEACH = 'bleach';
const TAG_SHAKE = 'shake';
const TAG_LIGHTNING = 'lightning';

export class FishHitShow {
  constructor(private readonly actions: ActionManager) {}

  play(fish: Fish): void {
    this.bleach(fish);
    this.shake(fish);
  }

  /**
   * 雷擊受擊（FishHitShow.lua LIGHTNING）：主目標白閃 0.7s、其他 0.3s；
   * 0.2s 後縮放脈動 ±4%（小魚 ±3%）每 0.04s 一次，直到白閃結束。delay = 依距離的延遲。
   */
  playLightning(fish: Fish, isMain: boolean, delay: number): void {
    const dur = isMain ? 0.7 : 0.3;
    const amp = fish.define.common.hitShake === HitShakeType.Small ? 0.03 : 0.04;
    const s = fish.sprite;
    const base = s.scale.clone();
    this.actions.stopByTag(fish, TAG_LIGHTNING);
    const steps = 6;
    const ramp = [];
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      ramp.push(Act.call(() => (fish.bleachRate = 1 - (1 - p) * (1 - p))), Act.delay(dur / steps));
    }
    const pulses = Math.max(0, Math.floor((dur - 0.2) / 0.04));
    const pulse = [];
    for (let i = 0; i < pulses; i++) {
      const k = i % 2 === 0 ? 1 + amp : 1 - amp;
      pulse.push(Act.call(() => s.scale.copy(base).multiplyScalar(k)), Act.delay(0.04));
    }
    this.actions.run(
      Act.seq(
        Act.delay(delay),
        Act.spawn(Act.seq(...ramp), Act.seq(Act.delay(0.2), ...pulse)),
        Act.call(() => {
          fish.bleachRate = 0;
          s.scale.copy(base);
        }),
      ),
      fish,
      { tag: TAG_LIGHTNING },
    );
  }

  private bleach(fish: Fish): void {
    if (this.actions.hasTag(fish, TAG_BLEACH)) return;
    const stepTime = HIT_BLEACH_DURATION / HIT_BLEACH_STEP;
    const steps = [];
    for (let i = 1; i <= HIT_BLEACH_STEP; i++) {
      const p = i / HIT_BLEACH_STEP;
      const rate = 1 - (1 - p) * (1 - p);
      steps.push(Act.call(() => (fish.bleachRate = rate)), Act.delay(stepTime));
    }
    steps.push(Act.call(() => (fish.bleachRate = 0)));
    this.actions.run(Act.seq(...steps), fish, { tag: TAG_BLEACH });
  }

  private shake(fish: Fish): void {
    if (this.actions.hasTag(fish, TAG_SHAKE)) return;
    // 沒設定 HitShakeNormalType（獵龍騎士、蒼龍翅膀）→ 不晃動
    const type = fish.define.common.hitShake;
    const def = type !== undefined ? HIT_SHAKE_DEFINE[type] : undefined;
    if (!def) return;
    const s = fish.sprite;
    const d3 = def.duration / 3;
    const once = () => Act.seq(Tw.moveBy(s, d3, def.offset, 0), Tw.moveBy(s, d3, -2 * def.offset, 0), Tw.moveBy(s, d3, def.offset, 0));
    this.actions.run(
      Act.seq(
        Act.repeat(once, def.times),
        Act.call(() => s.position.copy(fish.spriteHome)),
        Act.delay(def.delay),
      ),
      fish,
      { tag: TAG_SHAKE },
    );
  }
}
