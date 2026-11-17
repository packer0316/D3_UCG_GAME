/**
 * 獎圈 — 原版 Reward_Min_0 / Reward_Middle_0 / Reward_Big_0.csb（csb 無法直接讀，依 timeline 關鍵影格以 Tween 重做）
 *
 * 結構：Node(scale 0.8 self / 0.6 other) → Node_Scale(0.7) →
 *   光暈 SunLight（additive，start 時 alpha 0→1→0）+ Light_reward（loop 旋轉）
 *   bg（Big：reward_big1）、frame（Reward_Small / Middle / Big01）
 *   頭像 D3_xx（Reward_common_D3_1）、數字 d3_num_jp01.fnt、倍數字（Big + mega）、星星 star_B
 *
 * start（0.75s，60fps 影格換算）：
 *   frame  0f:0.36 → 10f:(1.10,1.23) → 15f:(1.09,0.75) → 20f:1.29
 *   img    5f 出現 0.3 → 15f:(1.3,1.43) → 20f:(1.2,0.9) → 25f:1.3，旋轉 -21→0
 *   num    10f 出現 0.47 → 20f:0.90 → 25f:0.75
 * end（0.33s）：縮到 0 → 移除
 * 數字不滾動，直接設值（原版即如此）。
 */
import * as THREE from 'three';
import { Act, Easing, type Action } from '@core/tween/Action';
import { formatCurrency } from '@core/math/cocos';
import { BitmapText } from '@engine/sprite2d/BitmapText';
import type { Sprite2D } from '@engine/sprite2d/Sprite2D';
import { WinCircleType, type MegaPrize, type WinCircleTypeId } from '../define/FishDefine';
import { FONT_WIN_CIRCLE, MEGA_PRIZE_IMAGE, WIN_CIRCLE_FRAMES } from '../define/RewardDefine';
import { makeSprite, type OverlayDeps } from './OverlayDeps';
import { Tw } from './Tweens';

const F = 1 / 60; // Cocos Studio timeline 60fps

export interface WinCircleParams {
  type: Exclude<WinCircleTypeId, 0>;
  money: number;
  fishImage: string;
  mega?: MegaPrize;
  isSelf: boolean;
}

/** 依關鍵影格產生 ScaleTo 序列（[frame, sx, sy]） */
function scaleKeys(obj: THREE.Object3D, keys: [number, number, number][], startFrame = 0): Action {
  const acts: Action[] = [];
  let prev = startFrame;
  for (const [frame, sx, sy] of keys) {
    acts.push(Tw.scaleTo(obj, (frame - prev) * F, sx, sy));
    prev = frame;
  }
  return Act.seq(...acts);
}

export class WinCircle {
  readonly root = new THREE.Group();
  private readonly inner = new THREE.Group();
  private parts: (Sprite2D | BitmapText)[] = [];
  private glow: Sprite2D | null = null;
  ended = false;

  constructor(
    private readonly deps: OverlayDeps,
    readonly params: WinCircleParams,
  ) {
    this.root.add(this.inner);
    this.inner.scale.setScalar(0.7);
    this.root.renderOrder = 6;
    this.build();
  }

  private add<T extends Sprite2D | BitmapText>(o: T | null, x = 0, y = 0, z = 0): T | null {
    if (!o) return null;
    o.position.set(x, y, z);
    o.renderOrder = 6;
    this.inner.add(o);
    this.parts.push(o);
    return o;
  }

  private build(): void {
    const { assets, actions } = this.deps;
    const p = this.params;
    const res = WIN_CIRCLE_FRAMES[p.type];

    // 旋轉光（loop）
    this.glow = this.add(makeSprite(assets, 'Light_reward.png', { additive: true }), 0, 5, 0);
    if (this.glow) {
      this.glow.scale.setScalar(p.type === WinCircleType.Big ? 1.6 : 1.3);
      this.glow.opacity = 0;
      const g = this.glow;
      actions.run(Act.forever(() => Tw.rotateTo(g, 4, (g.rotation.z * -180) / Math.PI + 360)), g);
    }
    // 爆光（start 時閃一下）
    const flash = this.add(makeSprite(assets, 'SunLight.png', { additive: true }), 0, 5, 0.5);
    if (flash) {
      flash.opacity = 0;
      flash.scale.setScalar(1.2);
      actions.run(Act.seq(Act.delay(5 * F), Tw.fadeTo(flash, 7 * F, 1), Tw.fadeTo(flash, 8 * F, 0)), flash);
    }

    const bg = res.bg ? this.add(makeSprite(assets, res.bg), 0, 0, 1) : null;
    const frame = this.add(makeSprite(assets, res.frame), 0, 0, 2);
    const img = this.add(makeSprite(assets, p.fishImage), 0, 4, 3);
    const font = assets.peekFont(FONT_WIN_CIRCLE);
    const num = font ? this.add(new BitmapText(font, formatCurrency(p.money)), 0, -78, 4) : null;
    const mega = p.mega ? this.add(makeSprite(assets, MEGA_PRIZE_IMAGE[p.mega]), 0, 92, 5) : null;

    // 星星
    const starPos = [
      [-70, 45],
      [72, 30],
      [-55, -40],
      [60, -48],
    ];
    for (const [x, y] of starPos) {
      const star = this.add(makeSprite(assets, 'star_B.png', { additive: true }), x, y, 6);
      if (!star) continue;
      star.scale.setScalar(0.3 + Math.random() * 0.3);
      star.opacity = 0;
      const s = star;
      actions.run(
        Act.seq(
          Act.delay(0.2 + Math.random() * 0.4),
          Act.forever(() => Act.seq(Tw.fadeTo(s, 0.35, 1), Tw.fadeTo(s, 0.35, 0.2))),
        ),
        s,
      );
    }

    // ---- start timeline
    if (frame) {
      frame.scale.setScalar(0.36);
      actions.run(
        scaleKeys(frame, [
          [10, 1.1, 1.23],
          [15, 1.09, 0.75],
          [20, 1.0, 1.0],
        ]),
        frame,
      );
    }
    if (bg) {
      bg.scale.setScalar(0.36);
      actions.run(scaleKeys(bg, [[10, 1.6, 1.6], [20, 1.4, 1.4]]), bg);
    }
    if (img) {
      img.visible = false;
      img.scale.setScalar(0.3 * 0.55);
      img.rotation2D = -21;
      const k = 0.55; // 頭像 150px 縮進外框
      actions.run(
        Act.seq(
          Act.delay(5 * F),
          Tw.show(img),
          Act.spawn(
            scaleKeys(
              img,
              [
                [15, 1.3 * k, 1.43 * k],
                [20, 1.2 * k, 0.9 * k],
                [25, 1.0 * k, 1.0 * k],
              ],
              5,
            ),
            Tw.rotateTo(img, 10 * F, 0),
          ),
        ),
        img,
      );
    }
    if (num) {
      num.visible = false;
      num.scale.setScalar(0.47 * 0.75);
      const k = 0.75;
      actions.run(
        Act.seq(
          Act.delay(10 * F),
          Tw.show(num),
          Tw.scaleTo(num, 10 * F, 0.9 * k, 0.9 * k, Easing.cubicOut),
          Tw.scaleTo(num, 5 * F, 0.75 * k, 0.75 * k),
        ),
        num,
      );
    }
    if (mega) {
      mega.visible = false;
      mega.scale.setScalar(2);
      actions.run(Act.seq(Act.delay(20 * F), Tw.show(mega), Tw.scaleTo(mega, 10 * F, 1, 1, Easing.backOut)), mega);
    }
    if (this.glow) actions.run(Act.seq(Act.delay(10 * F), Tw.fadeTo(this.glow, 15 * F, 0.8)), this.root);
  }

  /** end 動畫（0.33s）後移除 */
  end(onDone?: () => void): void {
    if (this.ended) return;
    this.ended = true;
    this.deps.actions.run(
      Act.seq(
        Tw.scaleTo(this.inner, 20 * F, 0, 0, Easing.easeIn(2)),
        Act.call(() => {
          this.dispose();
          onDone?.();
        }),
      ),
      this.root,
    );
  }

  dispose(): void {
    for (const p of this.parts) {
      this.deps.actions.stopAll(p);
      p.removeFromParent();
      p.dispose();
    }
    this.deps.actions.stopAll(this.root);
    this.parts = [];
    this.root.removeFromParent();
  }
}
