/**
 * 獵龍騎士 — 翻譯自原版 FishDragonSlainKnight.lua（PlayAnims / SetUnSelectable / OnKillOccupyNtf）
 *
 *   建立時隱藏；Reset → 隱藏；Wait → 顯示
 *   InGame / Run → 顯示，播一次後 PlayRunAnimation（Run 以「播一次 → 再播」的方式循環）
 *   SetUnSelectable：不改透明度（原版空實作，限制賠率不影響外觀）
 *   擊殺但不死（原版 OnKillOccupyNtf）→ 播 Attack，播完回到 Run
 *
 * 未做：佔領機制（佔領者 / 累積金額面板、U2G_UPDATE_OCCUPY_REQ、限制押注提示）— SPEC §14.6
 */
import type { KillFloatOddsNotify } from '@net/protocol';
import { Fish } from '../Fish';

export class DragonSlainKnightFish extends Fish {
  protected override onInit(): void {
    this.setVisible(false);
    super.onInit();
  }

  override playAnims(key: string, loop = true, speed = 1, onEnd?: () => void): void {
    if (key === 'Reset') {
      this.setVisible(false);
    } else if (key === 'Wait') {
      this.setVisible(true);
    } else if (key === 'InGame' || key === 'Run') {
      onEnd = () => this.playRunAnimation();
      this.setVisible(true);
      loop = false;
    }
    super.playAnims(key, loop, speed, onEnd);
  }

  override setUnSelectable(v: boolean): void {
    this.unselectable = v;
  }

  override onKillNotify(n: KillFloatOddsNotify): void {
    if (n.unDead) this.playAnims('Attack', false, 1, () => this.playRunAnimation());
  }
}
