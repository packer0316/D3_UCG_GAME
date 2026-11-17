/**
 * 樹精哥布林 — 翻譯自原版 FishTreeGoblin.lua（ctor / PlayAnims 覆寫）
 *
 *   建立時隱藏（碰撞照常；隱藏時本版的 hittable() 不會選到）
 *   Reset  → 隱藏
 *   InGame → 顯示、Boss 來襲，播一次後 PlayRunAnimation（Run / Run2 隨機輪播）
 *   所有動畫以速度 0.5 播放（設定值 Speed 優先，本魚全部也是 0.5）
 *
 * 大獎（Win_2 HitMore、Overlay BossShow）本階段不做 → 依 SPEC §7.2 降級。
 */
import { Fish } from '../Fish';

export class TreeGoblinFish extends Fish {
  protected override onInit(): void {
    super.onInit();
    this.setVisible(false);
  }

  override playAnims(key: string, loop = true, _speed = 1, onEnd?: () => void): void {
    if (key === 'Reset') {
      this.setVisible(false);
    } else if (key === 'InGame') {
      this.setVisible(true);
      onEnd = () => this.playRunAnimation();
      this.bossComing();
      loop = false;
    }
    super.playAnims(key, loop, 0.5, onEnd);
  }
}
