/**
 * 遠古巨蠍 / 風神翼龍 — 翻譯自原版 FishScorpion.lua、FishQuetzalcoatlus.lua（兩者 Init / PlayAnims 相同）
 *
 *   Init    → 隱藏、關閉碰撞
 *   Reset   → 隱藏
 *   InGame  → 顯示，播一次
 *   Declare → PlayRunAnimation + Boss 來襲
 *   播到 RunAnimation → 開啟碰撞
 *   所有動畫以速度 0.5 播放（設定值 Speed 優先）
 *
 * 風神翼龍另有 Act_Leave → Out_Normal（走一般 PlayAnims）、身上常駐煙霧 EFK（BodyEfk）。
 * 大獎（Overlay BossShow：巨蠍 Dig、風神 Out_BigWin）本階段不做 → 依 SPEC §7.2 降級。
 */
import { Fish } from '../Fish';

export class ScorpionFish extends Fish {
  protected override onInit(): void {
    super.onInit();
    this.setVisible(false);
    this.hittable = false;
  }

  override playAnims(key: string, loop = true, _speed = 1, onEnd?: () => void): void {
    if (key === 'Reset') {
      this.setVisible(false);
    } else if (key === 'InGame') {
      this.setVisible(true);
      loop = false;
    } else if (key === 'Declare') {
      this.playRunAnimation();
      this.bossComing();
      return;
    } else if (this.isRunAnim(key)) {
      this.hittable = true;
    }
    super.playAnims(key, loop, 0.5, onEnd);
  }
}

/** 風神翼龍（原版 FishQuetzalcoatlus 的 Init / PlayAnims 與遠古巨蠍相同） */
export class QuetzalcoatlusFish extends ScorpionFish {}
