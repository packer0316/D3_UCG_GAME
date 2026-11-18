/**
 * 獎圈 — 直接播原版 Reward_Min_0 / Reward_Middle_0 / Reward_Big_0.csb（CsbParser 轉檔 → CsdPlayer）
 * 對照 WinCircleBase.lua / WinCircleCommon.lua：
 *
 * show：
 *   ShowMegaAward   MegaAward / MegaAward_light 換成倍數字並顯示（沒有暴獎則隱藏）
 *   SetCircleImg    img 換成魚頭像（依 frame 名稱在已載入圖集找）
 *   SetAppearance   自己 opacity 255；別人 150（縮放由 WinCircleManager 設在 root）
 *   PlayExplosionNode  ExplosionNode（Death_Explosion_big_Anim）從頭播一次，播完隱藏
 *   start01         num 設成金額（不滾動）→ 播 "start"（0–45），播完停在最後一格
 * end（CallEndAnimation）：有 "end" 播 end（115–135），否則 ScaleTo(0.3, 0)；結束後移除
 */
import * as THREE from 'three';
import { Act } from '@core/tween/Action';
import { formatCurrency } from '@core/math/cocos';
import type { CsdInstance, CsdLibrary } from '@engine/csd/CsdPlayer';
import type { SpriteFrameRef } from '@engine/sprite2d/Sprite2D';
import type { MegaPrize, WinCircleTypeId } from '../define/FishDefine';
import { MEGA_PRIZE_IMAGE, WIN_CIRCLE_CSB, WIN_CIRCLE_OTHER, WIN_CIRCLE_RENDER_ORDER } from '../define/RewardDefine';
import type { OverlayDeps } from './OverlayDeps';
import { Tw } from './Tweens';

export interface WinCircleParams {
  type: Exclude<WinCircleTypeId, 0>;
  money: number;
  fishImage: string;
  mega?: MegaPrize;
  isSelf: boolean;
  /** 直接指定中間的圖（優先於 fishImage；例：UGC 掉券的券圖） */
  image?: SpriteFrameRef;
  /** 數字欄的文字（預設 = money 千分位；例：「x1」） */
  label?: string;
}

export class WinCircle {
  readonly root = new THREE.Group();
  private readonly inst: CsdInstance | null;
  ended = false;
  /** end 動畫播完、已移除 */
  done = false;

  constructor(
    private readonly deps: OverlayDeps,
    csd: CsdLibrary,
    readonly params: WinCircleParams,
  ) {
    const path = WIN_CIRCLE_CSB[params.type];
    this.inst = csd.get(path) ? csd.create(path) : null;
    if (!this.inst) {
      console.warn(`[WinCircle] ${path} not loaded`);
      return;
    }
    const inst = this.inst;
    this.root.add(inst.root);
    // CsdNodeView 都是 THREE.Group：巢狀 Group 會重設繪製順序，全部設同一個值
    inst.root.traverse((o) => (o.renderOrder = WIN_CIRCLE_RENDER_ORDER));
    if (!params.isSelf) inst.opacity = WIN_CIRCLE_OTHER.opacity;

    const { assets } = deps;
    // ShowMegaAward
    const mega = inst.find('MegaAward');
    if (mega) {
      const ref = params.mega ? assets.findFrame(MEGA_PRIZE_IMAGE[params.mega]) : null;
      mega.visible = !!ref;
      if (ref) {
        mega.setFrame(ref);
        inst.find('MegaAward_light')?.setFrame(ref);
      }
    }
    // SetCircleImg
    const img = params.image ?? assets.findFrame(params.fishImage);
    if (img) inst.find('img')?.setFrame(img);
    else console.warn(`[WinCircle] sprite frame not found: ${params.fishImage}`);
    // PlayExplosionNode
    const explosion = inst.find('ExplosionNode');
    if (explosion?.sub) {
      explosion.visible = true;
      explosion.sub.play(undefined, false, () => (explosion.visible = false));
    }
    // start01
    (inst.find('num') ?? inst.find('Num'))?.setText(params.label ?? formatCurrency(params.money));
    inst.play('start', false);
  }

  update(dt: number): void {
    if (!this.done) this.inst?.update(dt);
  }

  /** CallEndAnimation：播 end（或縮到 0）後移除 */
  end(onDone?: () => void): void {
    if (this.ended) return;
    this.ended = true;
    const finish = () => {
      this.dispose();
      onDone?.();
    };
    if (this.inst?.hasAnimation('end')) {
      this.inst.play('end', false, finish);
      return;
    }
    this.deps.actions.run(Act.seq(Tw.scaleTo(this.root, 0.3, 0, 0), Act.call(finish)), this.root);
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.deps.actions.stopAll(this.root);
    this.inst?.dispose();
    this.root.removeFromParent();
  }
}
