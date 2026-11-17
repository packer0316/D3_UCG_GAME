/**
 * 帝王暴龍 — 翻譯自原版 FishTRex.lua 的 PlayAnims 覆寫（WaitAction 動畫對應的行為）
 *
 *   建立時隱藏、不可命中
 *   Reset      → 隱藏
 *   InGameShow → Boss 來襲提示（本階段只發事件）
 *   InGame     → 顯示，播一次 InGame
 *   Declare    → 開始走路循環（RunAnimation），開啟碰撞
 */
import { Fish } from './Fish';

export class TRexFish extends Fish {
  override start(): void {
    this.setVisible(false);
    this.hittable = false;
    super.start();
  }

  protected override onWaitAnim(anim: string, silent: boolean): void {
    switch (anim) {
      case 'Reset':
        this.setVisible(false);
        this.hittable = false;
        this.playAnim('Reset', true);
        break;
      case 'InGameShow':
        if (!silent && this.fromScratch) this.hooks.onBossComing?.(this);
        this.playAnim('InGameShow', true);
        break;
      case 'InGame':
        this.setVisible(true);
        this.playAnim('InGame', false);
        break;
      case 'Declare':
        this.setVisible(true);
        this.playRunAnimation();
        this.hittable = true;
        break;
      default:
        super.onWaitAnim(anim, silent);
    }
  }
}
