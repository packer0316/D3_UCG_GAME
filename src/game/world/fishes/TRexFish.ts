/**
 * 帝王暴龍 — 翻譯自原版 FishTRex.lua（Init / PlayAnims 覆寫）
 *
 *   Init       → 隱藏、關閉碰撞（在 FishBase.Init 播完 RunAnimation 之後）
 *   Reset      → 隱藏
 *   InGameShow → Boss 來襲
 *   InGame     → 顯示，播一次
 *   Declare    → PlayRunAnimation（Walk_1 / Walk_2 隨機輪播）
 *   播到 RunAnimation → 開啟碰撞
 */
import { Fish } from '../Fish';

export class TRexFish extends Fish {
  protected override onInit(): void {
    super.onInit();
    this.setVisible(false);
    this.hittable = false;
  }

  override playAnims(key: string, loop = true, speed = 1, onEnd?: () => void): void {
    switch (key) {
      case 'Reset':
        this.setVisible(false);
        break;
      case 'InGameShow':
        this.bossComing();
        break;
      case 'InGame':
        this.setVisible(true);
        loop = false;
        break;
      case 'Declare':
        this.playRunAnimation();
        return;
      default:
        if (this.isRunAnim(key)) this.hittable = true;
    }
    super.playAnims(key, loop, speed, onEnd);
  }
}
