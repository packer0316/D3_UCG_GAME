/**
 * 擊殺表演分派（對照原版 FishBase:OnKillNotify / 各 Boss 類別覆寫）。
 *
 *   isBossShow = define.killShow.bossShowType != null && notify.showType == bossShowType
 *   handler = isBossShow ? bossShows[fishType] : byFish[fishType]
 *   找不到 → 預設 handler（SmallWinShow）
 *
 * 本階段不註冊任何 BossShow：BOSSSHOW 一律降級為小獎（unDead=false → 小獎死亡；unDead=true → 小獎不死）。
 * 之後只要 registerBossShow(24, TRexBossShow)，分派流程不用改。
 */
import type { KillFloatOddsNotify } from '@net/protocol';
import type { FishDefine } from '../define/FishDefine';
import type { Fish } from '../world/Fish';

export interface KillShowHandler {
  play(notify: KillFloatOddsNotify, fish: Fish | null, define: FishDefine | undefined): void;
}

export class KillShowRegistry {
  private byFish = new Map<number, KillShowHandler>();
  private bossShows = new Map<number, KillShowHandler>();
  private fallback: KillShowHandler | null = null;

  setDefault(handler: KillShowHandler): void {
    this.fallback = handler;
  }

  register(fishType: number, handler: KillShowHandler): void {
    this.byFish.set(fishType, handler);
  }

  registerBossShow(fishType: number, handler: KillShowHandler): void {
    this.bossShows.set(fishType, handler);
  }

  static isBossShow(notify: KillFloatOddsNotify, define: FishDefine | undefined): boolean {
    const t = define?.killShow?.bossShowType;
    return t !== undefined && t !== null && notify.showType === t;
  }

  resolve(notify: KillFloatOddsNotify, define: FishDefine | undefined): KillShowHandler {
    const h = KillShowRegistry.isBossShow(notify, define) ? this.bossShows.get(notify.fishType) : this.byFish.get(notify.fishType);
    const out = h ?? this.fallback;
    if (!out) throw new Error('[KillShowRegistry] no default handler');
    return out;
  }
}
